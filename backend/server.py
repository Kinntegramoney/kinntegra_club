from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Form, BackgroundTasks, Body, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
import random
import string
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from scipy.optimize import newton
import numpy as np
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from auth import verify_password, get_password_hash, create_access_token, verify_token
from email_service import (
    send_welcome_email_client, 
    send_welcome_email_subbroker,
    send_bond_opportunity_email,
    send_real_estate_opportunity_email,
    send_password_reset_email,
    send_credentials_email,
    send_prepayment_notification_email,
    send_holdings_report_email
)
from analysis_service import (
    CASParser, 
    NAVService, 
    GapSheetGenerator, 
    SchemeMapper,
    parse_scheme_master_file
)
from email_reader import (
    RepaymentEmailReader,
    process_repayment_emails,
    test_email_connection,
    list_all_emails
)
from dateutil.relativedelta import relativedelta
from calendar import monthrange


# ==================== DATE AND INTEREST CALCULATION HELPERS ====================

def add_months_fixed_day(start_date: datetime, months: int) -> datetime:
    """
    Add months to a date while keeping the same day of month.
    If the day doesn't exist in the target month (e.g., Jan 31 + 1 month), 
    use the last day of the target month.
    """
    target_month = start_date.month + months
    target_year = start_date.year + (target_month - 1) // 12
    target_month = ((target_month - 1) % 12) + 1
    
    # Get the last day of target month
    last_day_of_month = monthrange(target_year, target_month)[1]
    
    # Use the original day or last day if original doesn't exist
    target_day = min(start_date.day, last_day_of_month)
    
    return datetime(target_year, target_month, target_day)


def calculate_days_between(date1: datetime, date2: datetime) -> int:
    """Calculate actual days between two dates"""
    return abs((date2 - date1).days)


def generate_interest_payment_schedule(
    start_date: str,
    end_date: str,
    principal: float,
    coupon_rate: float,
    frequency: str = "quarterly"
) -> list:
    """
    Generate interest payment schedule with:
    - Fixed day of month for each payment
    - Interest calculated based on actual days in each period
    - Supports: monthly, quarterly, semi-annual, annual, on_maturity
    """
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    # Handle "on maturity" - single payment at end with all accrued interest
    if frequency.lower() in ['on_maturity', 'on-maturity', 'maturity', 'at_maturity', 'at-maturity']:
        days_total = calculate_days_between(start, end)
        daily_rate = (coupon_rate / 100) / 365
        total_interest = principal * daily_rate * days_total
        return [{
            "date": end.strftime('%Y-%m-%d'),
            "amount": round(total_interest, 2),
            "days": days_total,
            "is_partial": False,
            "payment_type": "on_maturity"
        }]
    
    months_interval = {
        "monthly": 1, 
        "quarterly": 3, 
        "semi-annual": 6, 
        "semi_annual": 6,
        "annual": 12
    }.get(frequency.lower(), 3)
    
    interest_payments = []
    current = start
    prev_date = start
    
    while True:
        # Add months while keeping the same day
        current = add_months_fixed_day(start, len(interest_payments) + 1) if months_interval == 1 else \
                  add_months_fixed_day(start, (len(interest_payments) + 1) * months_interval)
        
        if current > end:
            # Check if we need a final partial period payment at maturity
            if prev_date < end and prev_date != start:
                # Calculate interest for remaining days
                days_in_period = calculate_days_between(prev_date, end)
                daily_rate = (coupon_rate / 100) / 365
                interest_amount = principal * daily_rate * days_in_period
                interest_payments.append({
                    "date": end.strftime('%Y-%m-%d'),
                    "amount": round(interest_amount, 2),
                    "days": days_in_period,
                    "is_partial": True
                })
            break
        
        # Calculate interest based on actual days in this period
        days_in_period = calculate_days_between(prev_date, current)
        daily_rate = (coupon_rate / 100) / 365
        interest_amount = principal * daily_rate * days_in_period
        
        interest_payments.append({
            "date": current.strftime('%Y-%m-%d'),
            "amount": round(interest_amount, 2),
            "days": days_in_period,
            "is_partial": False
        })
        
        prev_date = current
    
    return interest_payments


def generate_combined_payment_schedule(
    start_date: str,
    end_date: str,
    principal: float,
    coupon_rate: float,
    principal_payments: list
) -> dict:
    """
    Generate combined payment schedule where:
    - Interest is paid MONTHLY from start date (on fixed day of month)
    - Principal payments follow the schedule from Sheet 4 (may start later)
    - Interest is calculated on REDUCING principal balance
    - Final payment aligns with maturity date (skips regular payment if too close)
    
    Args:
        start_date: Bond start date (YYYY-MM-DD)
        end_date: Bond maturity date (YYYY-MM-DD)
        principal: Total principal amount
        coupon_rate: Annual coupon rate (%)
        principal_payments: List of dicts with 'date' and 'percentage' keys
    
    Returns:
        dict with 'interest_payments', 'combined_schedule', and summary
    """
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    # Build a map of principal payment dates to percentages
    principal_payment_map = {}
    if principal_payments:
        for pp in principal_payments:
            principal_payment_map[pp['date']] = {
                'percentage': pp.get('percentage', 0),
                'description': pp.get('description', '')
            }
    
    combined_schedule = []
    interest_payments = []
    
    outstanding_principal = principal
    prev_date = start
    total_interest = 0
    total_principal_paid = 0
    payment_num = 1
    
    # Generate monthly payments from start to end
    while True:
        # Calculate next payment date (same day each month)
        current = add_months_fixed_day(start, payment_num)
        
        # If this payment date is at or past maturity, OR if it's very close to maturity
        # (within 15 days), make the final payment at maturity instead
        days_to_maturity = calculate_days_between(current, end)
        
        if current >= end or days_to_maturity <= 15:
            # Final payment at maturity date
            days_in_period = calculate_days_between(prev_date, end)
            daily_rate = (coupon_rate / 100) / 365
            interest_amount = round(outstanding_principal * daily_rate * days_in_period, 2)
            
            # Check if there's a principal payment on maturity
            end_date_str = end.strftime('%Y-%m-%d')
            principal_pct = 0
            principal_amt = 0
            if end_date_str in principal_payment_map:
                principal_pct = principal_payment_map[end_date_str]['percentage']
                principal_amt = round(principal * (principal_pct / 100), 2)
            
            interest_payments.append({
                "date": end_date_str,
                "amount": interest_amount,
                "days": days_in_period,
                "outstanding_principal": round(outstanding_principal, 2),
                "is_partial": True
            })
            
            combined_schedule.append({
                "date": end_date_str,
                "description": "Final Payment (Maturity)",
                "principal_percentage": principal_pct,
                "principal_amount": principal_amt,
                "interest_amount": interest_amount,
                "total_payment": round(principal_amt + interest_amount, 2),
                "outstanding_principal_before": round(outstanding_principal, 2),
                "outstanding_principal_after": round(outstanding_principal - principal_amt, 2),
                "days_in_period": days_in_period
            })
            
            total_interest += interest_amount
            total_principal_paid += principal_amt
            break
        
        # Calculate interest for this period
        days_in_period = calculate_days_between(prev_date, current)
        daily_rate = (coupon_rate / 100) / 365
        interest_amount = round(outstanding_principal * daily_rate * days_in_period, 2)
        
        # Check if there's a principal payment on this date
        current_date_str = current.strftime('%Y-%m-%d')
        principal_pct = 0
        principal_amt = 0
        description = f"Payment {payment_num}"
        
        if current_date_str in principal_payment_map:
            principal_pct = principal_payment_map[current_date_str]['percentage']
            principal_amt = round(principal * (principal_pct / 100), 2)
            description = principal_payment_map[current_date_str].get('description', description)
        
        interest_payments.append({
            "date": current_date_str,
            "amount": interest_amount,
            "days": days_in_period,
            "outstanding_principal": round(outstanding_principal, 2),
            "is_partial": False
        })
        
        combined_schedule.append({
            "date": current_date_str,
            "description": description,
            "principal_percentage": principal_pct,
            "principal_amount": principal_amt,
            "interest_amount": interest_amount,
            "total_payment": round(principal_amt + interest_amount, 2),
            "outstanding_principal_before": round(outstanding_principal, 2),
            "outstanding_principal_after": round(outstanding_principal - principal_amt, 2),
            "days_in_period": days_in_period
        })
        
        total_interest += interest_amount
        total_principal_paid += principal_amt
        outstanding_principal -= principal_amt
        prev_date = current
        payment_num += 1
    
    return {
        "interest_payments": interest_payments,
        "combined_schedule": combined_schedule,
        "total_interest": round(total_interest, 2),
        "total_principal": round(total_principal_paid, 2),
        "total_payout": round(total_interest + total_principal_paid, 2)
    }


# ==================== BOND PREPAYMENT PROCESSING ====================

async def process_bond_prepayment(
    db_instance,
    trade_id: str,
    prepayment_amount: float,
    prepayment_date: datetime,
    source: str = "manual",  # "manual", "historical_upload", "email_reader"
    recorded_by: str = None,
    notes: str = None
) -> dict:
    """
    Core function to process a bond principal prepayment.
    
    LOGIC (based on CDNRE001 transaction example):
    1. When prepayment happens, the BALANCE PRINCIPAL reduces immediately
    2. Future INTEREST is calculated on the NEW REDUCED balance for actual days
    3. Interest = (Balance Principal × Coupon Rate × Days) / 365
    4. Final maturity payment = Remaining Principal + Accumulated Interest
    
    This function:
    1. Validates the prepayment against outstanding principal
    2. Reduces the balance principal
    3. Recalculates ALL future cashflows:
       - Interest based on reduced balance × days × coupon rate
       - Final principal = remaining balance after all prepayments
    4. Updates trade with remaining principal info
    5. Auto-closes trade if fully prepaid
    
    Args:
        db_instance: MongoDB database instance
        trade_id: The trade/holding ID
        prepayment_amount: Amount of principal being prepaid
        prepayment_date: Date of the prepayment
        source: Source of prepayment ("manual", "historical_upload", "email_reader")
        recorded_by: User ID who recorded this prepayment
        notes: Optional notes about the prepayment
    
    Returns:
        dict with processing results
    """
    import logging
    logger = logging.getLogger(__name__)
    
    result = {
        "success": False,
        "trade_id": trade_id,
        "prepayment_amount": prepayment_amount,
        "prepayment_date": prepayment_date.isoformat() if prepayment_date else None,
        "source": source,
        "cashflows_modified": 0,
        "remaining_principal": 0,
        "remaining_principal_ratio": 1.0,
        "trade_closed": False,
        "errors": []
    }
    
    try:
        # Get trade details
        trade = await db_instance.trades.find_one({"id": trade_id}, {"_id": 0})
        if not trade:
            result["errors"].append(f"Trade {trade_id} not found")
            return result
        
        # Get bond details
        bond = await db_instance.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
        if not bond:
            result["errors"].append(f"Bond {trade['bond_id']} not found")
            return result
        
        # Get all cashflows for this trade
        all_cashflows = await db_instance.holding_cashflows.find(
            {"trade_id": trade_id},
            {"_id": 0}
        ).sort("date", 1).to_list(200)
        
        if not all_cashflows:
            result["errors"].append(f"No cashflows found for trade {trade_id}")
            return result
        
        # Calculate original principal for this trade
        original_principal = bond.get('principal_amount', 0) * trade.get('units', 0)
        
        # Get previous prepayments for this trade
        previous_prepayments = await db_instance.prepayment_records.find(
            {"trade_id": trade_id},
            {"_id": 0}
        ).to_list(50)
        
        total_previously_prepaid = sum(p.get('prepaid_amount', 0) for p in previous_prepayments)
        
        # Calculate outstanding principal before this prepayment
        # Outstanding = Original - Already Prepaid - Already Repaid Principal
        repaid_principal = sum(
            cf.get('principal_component', 0) 
            for cf in all_cashflows 
            if cf.get('is_repaid')
        )
        outstanding_principal = original_principal - total_previously_prepaid - repaid_principal
        
        if outstanding_principal <= 0:
            result["errors"].append(f"No outstanding principal remaining. Original: {original_principal}, Prepaid: {total_previously_prepaid}, Repaid: {repaid_principal}")
            return result
        
        # Validate prepayment amount
        if prepayment_amount > outstanding_principal:
            result["errors"].append(f"Prepayment amount ({prepayment_amount}) exceeds outstanding principal ({outstanding_principal})")
            return result
        
        if prepayment_amount <= 0:
            result["errors"].append("Prepayment amount must be positive")
            return result
        
        # Calculate remaining principal after this prepayment
        remaining_principal = outstanding_principal - prepayment_amount
        
        # Total prepaid after this prepayment
        total_prepaid_after = total_previously_prepaid + prepayment_amount
        
        # Get coupon rate for interest recalculation
        # Coupon rate should be the one used for client (e.g., 18.78% from Excel)
        coupon_rate = bond.get('coupon_rate', 0)
        if coupon_rate == 0:
            coupon_rate = bond.get('interest_rate', 0)
        coupon_rate = coupon_rate / 100 if coupon_rate > 1 else coupon_rate  # Convert to decimal if percentage
        
        # Track modifications
        modified_count = 0
        
        # =====================================================
        # NEW LOGIC: Recalculate interest based on balance principal and days
        # Following CDNRE001 example:
        # Interest = Balance Principal × Coupon Rate × Days / 365
        # =====================================================
        
        # Get all prepayments including this one, sorted by date
        all_prepayments_data = []
        for p in previous_prepayments:
            p_date_str = p.get('prepayment_date', '')
            if p_date_str:
                try:
                    p_date = datetime.fromisoformat(p_date_str.replace('Z', '+00:00'))
                except:
                    p_date = datetime.strptime(p_date_str[:10], '%Y-%m-%d')
                all_prepayments_data.append({
                    'date': p_date,
                    'amount': p.get('prepaid_amount', 0)
                })
        
        # Add current prepayment
        all_prepayments_data.append({
            'date': prepayment_date,
            'amount': prepayment_amount
        })
        
        # Sort prepayments by date
        all_prepayments_data.sort(key=lambda x: x['date'])
        
        # Find the maturity/final cashflow (the one with the most principal)
        final_cashflow = None
        max_principal = 0
        for cf in all_cashflows:
            if cf.get('principal_component', 0) > max_principal and not cf.get('is_repaid'):
                max_principal = cf.get('principal_component', 0)
                final_cashflow = cf
        
        if not final_cashflow:
            # Use the last unpaid cashflow
            for cf in reversed(all_cashflows):
                if not cf.get('is_repaid'):
                    final_cashflow = cf
                    break
        
        if final_cashflow:
            # Store original values if not already stored
            original_principal_component = final_cashflow.get('original_principal_component') or final_cashflow.get('principal_component', 0)
            original_interest_component = final_cashflow.get('original_interest_component') or final_cashflow.get('interest_component', 0)
            original_tds_amount = final_cashflow.get('original_tds_amount') or final_cashflow.get('tds_amount', 0)
            original_gross_amount = final_cashflow.get('original_gross_amount') or final_cashflow.get('gross_amount', 0)
            original_net_amount = final_cashflow.get('original_net_amount') or final_cashflow.get('net_amount', 0)
            
            # Parse final cashflow date
            final_date_str = final_cashflow.get('date', '')
            try:
                final_date = datetime.fromisoformat(final_date_str.replace('Z', '+00:00'))
            except:
                final_date = datetime.strptime(final_date_str[:10], '%Y-%m-%d')
            
            # Calculate interest based on balance principal for each period
            # Following the Excel logic exactly
            
            # Get bond start date or investment date
            inv_date_str = trade.get('investment_date', '') or bond.get('start_date', '')
            try:
                inv_date = datetime.fromisoformat(inv_date_str.replace('Z', '+00:00'))
            except:
                inv_date = datetime.strptime(inv_date_str[:10], '%Y-%m-%d')
            
            # Build the timeline of events
            events = [{'date': inv_date, 'type': 'start', 'amount': 0}]
            
            for p in all_prepayments_data:
                events.append({'date': p['date'], 'type': 'prepayment', 'amount': p['amount']})
            
            events.append({'date': final_date, 'type': 'maturity', 'amount': 0})
            
            # Sort events by date
            events.sort(key=lambda x: x['date'])
            
            # Calculate interest period by period
            balance_principal = original_principal
            total_accumulated_interest = 0
            prev_date = inv_date
            
            for event in events:
                if event['type'] == 'start':
                    continue
                
                # Calculate days from previous date
                days = (event['date'].replace(tzinfo=None) - prev_date.replace(tzinfo=None)).days
                if days < 0:
                    days = 0
                
                # Interest for this period = Balance × Coupon × Days / 365
                period_interest = (balance_principal * coupon_rate * days) / 365
                total_accumulated_interest += period_interest
                
                # If prepayment, reduce balance
                if event['type'] == 'prepayment':
                    balance_principal -= event['amount']
                    if balance_principal < 0:
                        balance_principal = 0
                
                prev_date = event['date']
            
            # Final principal at maturity = remaining balance after all prepayments
            final_principal = balance_principal
            final_interest = round(total_accumulated_interest, 2)
            
            # TDS: 10% of interest
            new_tds = round(final_interest * 0.10, 2)
            
            # Gross and Net amounts
            new_gross = round(final_principal + final_interest, 2)
            new_net = round(new_gross - new_tds, 2)
            
            # Update the final cashflow
            update_data = {
                # Store originals (preserve first original values)
                "original_principal_component": original_principal_component,
                "original_interest_component": original_interest_component,
                "original_tds_amount": original_tds_amount,
                "original_gross_amount": original_gross_amount,
                "original_net_amount": original_net_amount,
                # New calculated values based on day-by-day interest
                "principal_component": round(final_principal, 2),
                "interest_component": final_interest,
                "tds_amount": new_tds,
                "gross_amount": new_gross,
                "net_amount": new_net,
                # Metadata
                "is_prepayment_amended": True,
                "prepayment_amended_at": datetime.now(timezone.utc).isoformat(),
                "prepayment_amended_by": recorded_by,
                "prepayment_source": source,
                "balance_principal_at_maturity": round(final_principal, 2),
                "accumulated_interest": final_interest,
                "total_prepaid_principal": round(total_prepaid_after, 2),
                "coupon_rate_used": coupon_rate,
                "amendment_reason": f"Prepayment of ₹{prepayment_amount:,.2f} on {prepayment_date.strftime('%d-%m-%Y')}. Balance: ₹{final_principal:,.2f}. Interest recalculated: ₹{final_interest:,.2f}"
            }
            
            await db_instance.holding_cashflows.update_one(
                {"id": final_cashflow['id']},
                {"$set": update_data}
            )
            modified_count += 1
        
        # Also update any intermediate cashflows that represent prepayments
        # These should have principal = prepayment amount, interest = 0
        for cf in all_cashflows:
            if cf.get('is_repaid'):
                continue
            if cf.get('id') == final_cashflow.get('id') if final_cashflow else None:
                continue
            
            cf_date_str = cf.get('date', '')
            try:
                cf_date = datetime.fromisoformat(cf_date_str.replace('Z', '+00:00'))
            except:
                try:
                    cf_date = datetime.strptime(cf_date_str[:10], '%Y-%m-%d')
                except:
                    continue
            
            # Check if this cashflow date matches any prepayment date
            for p in all_prepayments_data:
                if abs((cf_date.replace(tzinfo=None) - p['date'].replace(tzinfo=None)).days) <= 1:
                    # This is a prepayment cashflow - should show prepayment amount, no interest
                    orig_principal = cf.get('original_principal_component') or cf.get('principal_component', 0)
                    orig_interest = cf.get('original_interest_component') or cf.get('interest_component', 0)
                    
                    await db_instance.holding_cashflows.update_one(
                        {"id": cf['id']},
                        {"$set": {
                            "original_principal_component": orig_principal,
                            "original_interest_component": orig_interest,
                            "principal_component": round(p['amount'], 2),
                            "interest_component": 0,
                            "tds_amount": 0,
                            "gross_amount": round(p['amount'], 2),
                            "net_amount": round(p['amount'], 2),
                            "is_prepayment_cashflow": True,
                            "prepayment_amended_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    modified_count += 1
                    break
        
        result["cashflows_modified"] = modified_count
        result["remaining_principal"] = round(remaining_principal, 2)
        result["remaining_principal_ratio"] = round(remaining_principal / original_principal, 4) if original_principal > 0 else 0
        
        # Record the prepayment
        prepayment_record = {
            "id": str(uuid.uuid4()),
            "trade_id": trade_id,
            "client_id": trade['client_id'],
            "bond_id": trade['bond_id'],
            "bond_name": trade.get('bond_name', bond.get('name', '')),
            "prepayment_date": prepayment_date.isoformat(),
            "prepaid_amount": prepayment_amount,
            "original_principal": original_principal,
            "outstanding_before_prepayment": outstanding_principal,
            "remaining_principal": remaining_principal,
            "remaining_ratio": round(remaining_principal / original_principal, 4) if original_principal > 0 else 0,
            "total_prepaid_to_date": total_prepaid_after,
            "source": source,
            "notes": notes,
            "recorded_by": recorded_by,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "cashflows_modified": modified_count
        }
        
        await db_instance.prepayment_records.insert_one(prepayment_record)
        
        # Update trade with prepayment info
        trade_update = {
            "has_prepayment": True,
            "total_prepaid_principal": total_previously_prepaid + prepayment_amount,
            "remaining_principal": remaining_principal,
            "last_prepayment_date": prepayment_date.isoformat(),
            "last_prepayment_source": source,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Check if fully prepaid (trade should be closed)
        if remaining_principal <= 0.01:  # Allow for small rounding errors
            trade_update["status"] = "closed"
            trade_update["closed_reason"] = "fully_prepaid"
            trade_update["closed_at"] = datetime.now(timezone.utc).isoformat()
            result["trade_closed"] = True
            
            # Check if all trades for this bond are closed
            active_trades = await db_instance.trades.count_documents({
                "bond_id": trade['bond_id'],
                "status": {"$ne": "closed"}
            })
            
            if active_trades <= 1:  # This trade will be closed, so check if it's the last one
                # Update bond status to closed
                await db_instance.bonds.update_one(
                    {"id": trade['bond_id']},
                    {"$set": {
                        "status": "closed",
                        "closed_reason": "all_trades_prepaid",
                        "closed_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
        
        await db_instance.trades.update_one(
            {"id": trade_id},
            {"$set": trade_update}
        )
        
        result["success"] = True
        logger.info(f"Processed prepayment for trade {trade_id}: amount={prepayment_amount}, remaining={remaining_principal}, modified={modified_count} cashflows")
        
    except Exception as e:
        logger.error(f"Error processing prepayment for trade {trade_id}: {str(e)}")
        result["errors"].append(str(e))
    
    return result


async def detect_and_process_prepayments_from_repayment(
    db_instance,
    repayment_record: dict,
    trade_id: str,
    recorded_by: str = None
) -> dict:
    """
    Detect if a repayment record contains a prepayment and process it.
    
    A prepayment is detected when:
    1. Principal amount in repayment > scheduled principal for that date
    2. Repayment date doesn't match any scheduled cashflow date
    3. Repayment explicitly marked as prepayment
    
    Args:
        db_instance: MongoDB database instance
        repayment_record: The repayment data from upload or email
        trade_id: The trade/holding ID
        recorded_by: User ID who recorded this
    
    Returns:
        dict with detection and processing results
    """
    result = {
        "is_prepayment": False,
        "prepayment_amount": 0,
        "processing_result": None
    }
    
    try:
        repayment_date_str = repayment_record.get('repayment_date', '')
        if not repayment_date_str:
            return result
        
        # Parse repayment date
        try:
            rep_date = datetime.fromisoformat(repayment_date_str.replace('Z', '+00:00').split('T')[0])
        except:
            try:
                rep_date = datetime.strptime(repayment_date_str.split('T')[0], '%Y-%m-%d')
            except:
                return result
        
        rep_principal = repayment_record.get('principal', 0) or 0
        
        # Get scheduled cashflows for this trade
        scheduled_cashflows = await db_instance.holding_cashflows.find(
            {"trade_id": trade_id},
            {"_id": 0}
        ).to_list(200)
        
        # Find if there's a scheduled cashflow for this date
        scheduled_cf = None
        rep_date_str = rep_date.strftime('%Y-%m-%d')
        
        for cf in scheduled_cashflows:
            cf_date_str = cf.get('date', '').split('T')[0]
            if cf_date_str == rep_date_str:
                scheduled_cf = cf
                break
        
        # Determine if this is a prepayment
        if scheduled_cf:
            # Check if principal exceeds scheduled principal
            scheduled_principal = scheduled_cf.get('principal_component', 0)
            if rep_principal > scheduled_principal + 0.01:  # Allow small tolerance
                # This has excess principal - it's a partial prepayment
                prepayment_amount = rep_principal - scheduled_principal
                result["is_prepayment"] = True
                result["prepayment_amount"] = prepayment_amount
        else:
            # No scheduled cashflow on this date - check if it's a pure prepayment
            if rep_principal > 0:
                result["is_prepayment"] = True
                result["prepayment_amount"] = rep_principal
        
        # Process the prepayment if detected
        if result["is_prepayment"] and result["prepayment_amount"] > 0:
            result["processing_result"] = await process_bond_prepayment(
                db_instance=db_instance,
                trade_id=trade_id,
                prepayment_amount=result["prepayment_amount"],
                prepayment_date=rep_date,
                source="historical_upload",
                recorded_by=recorded_by,
                notes=f"Auto-detected from repayment record"
            )
    
    except Exception as e:
        result["error"] = str(e)
    
    return result


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Helper functions for password/PIN generation
def generate_password(length=10):
    """Generate a random password with letters, digits, and special chars"""
    import random
    import string
    chars = string.ascii_letters + string.digits + "@#$%"
    return ''.join(random.choice(chars) for _ in range(length))

def generate_pin(length=4):
    """Generate a random numeric PIN"""
    import random
    return ''.join(str(random.randint(0, 9)) for _ in range(length))

# Create the main app without a prefix
app = FastAPI()

# Health check endpoint for Kubernetes
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes liveness/readiness probes"""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Auth Models
class LoginStep1(BaseModel):
    pan: str
    password: str

class LoginStep2(BaseModel):
    temp_token: str
    pin: str

class PasswordResetRequest(BaseModel):
    pan: str
    email: str

class PasswordResetConfirm(BaseModel):
    reset_token: str
    new_password: str
    new_pin: str

# ==================== ROLE PERMISSIONS MODEL ====================
class RolePermission(BaseModel):
    """Model for role-based access control permissions"""
    feature: str
    action: str  # create, edit, view, delete, special
    broker: bool = True
    sub_broker: bool = False
    client: bool = False
    description: Optional[str] = None

class RolePermissionsUpdate(BaseModel):
    """Model for updating role permissions"""
    permissions: List[dict]

# Default role permissions based on master_role.xlsx
DEFAULT_ROLE_PERMISSIONS = [
    # Opportunities - Bonds
    {"feature": "opportunities_bonds", "action": "create", "broker": True, "sub_broker": False, "client": False, "description": "Create bond opportunities"},
    {"feature": "opportunities_bonds", "action": "edit", "broker": True, "sub_broker": False, "client": False, "description": "Edit bond opportunities"},
    {"feature": "opportunities_bonds", "action": "view", "broker": True, "sub_broker": True, "client": True, "description": "View bond opportunities"},
    {"feature": "opportunities_bonds", "action": "delete", "broker": True, "sub_broker": False, "client": False, "description": "Delete bond opportunities"},
    
    # Opportunities - Real Estate
    {"feature": "opportunities_real_estate", "action": "create", "broker": True, "sub_broker": False, "client": False, "description": "Create real estate opportunities"},
    {"feature": "opportunities_real_estate", "action": "edit", "broker": True, "sub_broker": False, "client": False, "description": "Edit real estate opportunities"},
    {"feature": "opportunities_real_estate", "action": "view", "broker": True, "sub_broker": True, "client": True, "description": "View real estate opportunities"},
    {"feature": "opportunities_real_estate", "action": "delete", "broker": True, "sub_broker": False, "client": False, "description": "Delete real estate opportunities"},
    
    # User - Sub Broker
    {"feature": "user_sub_broker", "action": "create", "broker": True, "sub_broker": False, "client": False, "description": "Create sub-brokers"},
    {"feature": "user_sub_broker", "action": "edit", "broker": True, "sub_broker": True, "client": False, "description": "Edit sub-broker details"},
    {"feature": "user_sub_broker", "action": "view", "broker": True, "sub_broker": True, "client": False, "description": "View sub-brokers"},
    {"feature": "user_sub_broker", "action": "delete", "broker": True, "sub_broker": False, "client": False, "description": "Delete sub-brokers"},
    
    # User - Client
    {"feature": "user_client", "action": "create", "broker": True, "sub_broker": False, "client": False, "description": "Create clients"},
    {"feature": "user_client", "action": "edit", "broker": True, "sub_broker": True, "client": True, "description": "Edit client details"},
    {"feature": "user_client", "action": "view", "broker": True, "sub_broker": True, "client": True, "description": "View clients"},
    {"feature": "user_client", "action": "delete", "broker": True, "sub_broker": False, "client": False, "description": "Delete clients"},
    
    # Holdings
    {"feature": "holdings", "action": "view_all", "broker": True, "sub_broker": False, "client": False, "description": "View holdings for all clients"},
    {"feature": "holdings", "action": "view_tagged", "broker": True, "sub_broker": True, "client": False, "description": "View holdings for tagged clients"},
    {"feature": "holdings", "action": "view_self", "broker": True, "sub_broker": True, "client": True, "description": "View own holdings"},
    
    # Logs
    {"feature": "logs", "action": "view_all", "broker": True, "sub_broker": False, "client": False, "description": "View logs for all clients"},
    {"feature": "logs", "action": "view_tagged", "broker": True, "sub_broker": True, "client": False, "description": "View logs for tagged clients"},
    {"feature": "logs", "action": "view_self", "broker": True, "sub_broker": True, "client": True, "description": "View own logs"},
    
    # Reinvestment
    {"feature": "reinvestment", "action": "tag_all", "broker": True, "sub_broker": False, "client": False, "description": "Tag reinvestment for all clients"},
    {"feature": "reinvestment", "action": "tag_tagged", "broker": True, "sub_broker": True, "client": False, "description": "Tag reinvestment for tagged clients"},
    {"feature": "reinvestment", "action": "approve_reject", "broker": True, "sub_broker": True, "client": True, "description": "Approve/Reject reinvestment"},
    
    # API Trigger
    {"feature": "api_trigger", "action": "trigger", "broker": True, "sub_broker": False, "client": False, "description": "Trigger API and notify sub-broker"},
    {"feature": "api_trigger", "action": "approve_reject", "broker": True, "sub_broker": True, "client": True, "description": "Approve/Reject API trigger"},
    
    # Tagged Tab
    {"feature": "tagged_tab", "action": "view", "broker": True, "sub_broker": True, "client": True, "description": "View tagged tab"},
    
    # Analysis
    {"feature": "analysis", "action": "view", "broker": True, "sub_broker": True, "client": False, "description": "View analysis dashboard"},
    
    # Upload
    {"feature": "upload", "action": "bulk_upload", "broker": True, "sub_broker": False, "client": False, "description": "Bulk upload data"},
]

class CustomerSignup(BaseModel):
    pan: str
    name: str
    email: str
    phone: str
    password: str
    pin: str

class UserCreate(BaseModel):
    pan: str
    name: str
    email: str
    phone: str
    password: str
    pin: str
    role: str  # "broker" or "sub_broker"

class User(BaseModel):
    id: str
    pan: str
    name: str
    email: str
    phone: str
    role: str
    created_at: datetime

class UserInDB(User):
    password_hash: str
    pin_hash: str


# Auth Helper Functions
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user from JWT token"""
    token = credentials.credentials
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user


# Auth Routes
@api_router.post("/auth/login-step1")
async def login_step1(login: LoginStep1):
    """Step 1: Verify PAN and Password, return temp token"""
    # Find user by PAN
    user = await db.users.find_one({"pan": login.pan.upper()})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid PAN or Password")
    
    # Verify password
    if not verify_password(login.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid PAN or Password")
    
    # Create temporary token (expires in 5 minutes)
    temp_token = create_access_token(
        data={"user_id": user['id'], "step": 1},
        expires_delta=timedelta(minutes=5)
    )
    
    return {"temp_token": temp_token}


@api_router.post("/auth/login-step2")
async def login_step2(login: LoginStep2):
    """Step 2: Verify PIN and return full access token"""
    # Verify temp token
    payload = verify_token(login.temp_token)
    
    if not payload or payload.get("step") != 1:
        raise HTTPException(status_code=401, detail="Invalid or expired temporary token")
    
    user_id = payload.get("user_id")
    user = await db.users.find_one({"id": user_id})
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Check if user is active (for clients, they must verify profile first)
    if user.get('is_active') is False:
        raise HTTPException(status_code=403, detail="Account not activated. Please verify your profile first.")
    
    # Verify PIN
    if not verify_password(login.pin, user['pin_hash']):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    # Create full access token
    access_token = create_access_token(
        data={"user_id": user['id'], "role": user['role']}
    )
    
    # Add client_id for client users
    user_response = {
        "id": user['id'],
        "pan": user['pan'],
        "name": user['name'],
        "email": user['email'],
        "phone": user['phone'],
        "role": user['role']
    }
    
    if user['role'] == 'client' and user.get('client_id'):
        user_response['client_id'] = user['client_id']
    
    return {
        "token": access_token,
        "user": user_response
    }


# Password Reset Routes
@api_router.post("/auth/forgot-password")
async def forgot_password(request: PasswordResetRequest, background_tasks: BackgroundTasks):
    """Request password reset - sends email with reset token"""
    # Find user by PAN and email
    user = await db.users.find_one({
        "pan": request.pan.upper(),
        "email": request.email.lower()
    })
    
    if not user:
        # Don't reveal if user exists or not for security
        return {"message": "If your PAN and email match our records, you will receive a reset link"}
    
    # Create reset token (expires in 1 hour)
    reset_token = create_access_token(
        data={"user_id": user['id'], "type": "password_reset"},
        expires_delta=timedelta(hours=1)
    )
    
    # Store reset token in database
    await db.password_resets.insert_one({
        "user_id": user['id'],
        "token": reset_token,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "used": False
    })
    
    # Send reset email
    try:
        background_tasks.add_task(
            send_password_reset_email,
            user['email'],
            user['name'],
            reset_token
        )
    except Exception as e:
        logger.error(f"Error sending reset email: {e}")
    
    return {"message": "If your PAN and email match our records, you will receive a reset link"}


@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordResetConfirm):
    """Reset password and PIN using reset token"""
    # Verify token
    payload = verify_token(request.reset_token)
    
    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    user_id = payload.get("user_id")
    
    # Check if token was already used
    reset_record = await db.password_resets.find_one({
        "user_id": user_id,
        "token": request.reset_token,
        "used": False
    })
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Reset token already used or invalid")
    
    # Validate new password and PIN
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    if len(request.new_pin) != 4 or not request.new_pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    
    # Update user password and PIN
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": get_password_hash(request.new_password),
            "pin_hash": get_password_hash(request.new_pin)
        }}
    )
    
    # Mark token as used
    await db.password_resets.update_one(
        {"_id": reset_record["_id"]},
        {"$set": {"used": True}}
    )
    
    return {"message": "Password and PIN reset successfully. You can now login with your new credentials."}


@api_router.get("/auth/verify-reset-token/{token}")
async def verify_reset_token(token: str):
    """Verify if a reset token is valid"""
    payload = verify_token(token)
    
    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check if token was already used
    reset_record = await db.password_resets.find_one({
        "token": token,
        "used": False
    })
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Reset token already used")
    
    return {"valid": True, "message": "Token is valid"}


# Customer Self-Registration
@api_router.post("/auth/customer-signup")
async def customer_signup(signup: CustomerSignup):
    """Allow customers to sign up directly"""
    # Validate PAN format (basic validation)
    pan = signup.pan.upper().strip()
    if len(pan) != 10:
        raise HTTPException(status_code=400, detail="PAN must be exactly 10 characters")
    
    # Check if PAN already exists
    existing_user = await db.users.find_one({"pan": pan})
    if existing_user:
        raise HTTPException(status_code=400, detail="PAN already registered. Please login or reset your password.")
    
    # Check if email already exists
    existing_email = await db.users.find_one({"email": signup.email.lower()})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate password
    if len(signup.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Validate PIN
    if len(signup.pin) != 4 or not signup.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    
    # Create user account
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "pan": pan,
        "name": signup.name.strip(),
        "email": signup.email.lower().strip(),
        "phone": signup.phone.strip(),
        "password_hash": get_password_hash(signup.password),
        "pin_hash": get_password_hash(signup.pin),
        "role": "client",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "self_registered": True
    }
    
    await db.users.insert_one(user)
    
    # Create corresponding client record
    client_id = str(uuid.uuid4())
    client = {
        "id": client_id,
        "name": signup.name.strip(),
        "email": signup.email.lower().strip(),
        "phone": signup.phone.strip(),
        "pan": pan,
        "city": "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": "self_registration"
    }
    
    await db.clients.insert_one(client)
    
    # Link user to client
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"client_id": client_id}}
    )
    
    return {
        "message": "Account created successfully! You can now login.",
        "user": {
            "id": user_id,
            "pan": pan,
            "name": signup.name,
            "email": signup.email,
            "role": "client"
        }
    }


# ==================== ROLE PERMISSIONS ENDPOINTS ====================

@api_router.get("/role-permissions")
async def get_role_permissions(current_user: dict = Depends(get_current_user)):
    """Get all role permissions. Broker can view and modify, others can only view their own permissions."""
    # Get permissions from database or use defaults
    permissions_doc = await db.role_permissions.find_one({"type": "master"})
    
    if permissions_doc:
        permissions = permissions_doc.get("permissions", DEFAULT_ROLE_PERMISSIONS)
    else:
        # Initialize with defaults
        await db.role_permissions.insert_one({
            "type": "master",
            "permissions": DEFAULT_ROLE_PERMISSIONS,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": None
        })
        permissions = DEFAULT_ROLE_PERMISSIONS
    
    # Remove MongoDB _id field
    return {
        "permissions": permissions,
        "user_role": current_user.get("role"),
        "can_edit": current_user.get("role") == "broker"
    }

@api_router.put("/role-permissions")
async def update_role_permissions(
    data: RolePermissionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update role permissions. Only brokers can modify permissions."""
    if current_user.get("role") != "broker":
        raise HTTPException(status_code=403, detail="Only brokers can modify role permissions")
    
    # Validate permissions structure
    for perm in data.permissions:
        if not all(key in perm for key in ["feature", "action", "broker", "sub_broker", "client"]):
            raise HTTPException(status_code=400, detail="Invalid permission structure")
    
    # Update in database
    await db.role_permissions.update_one(
        {"type": "master"},
        {
            "$set": {
                "permissions": data.permissions,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user.get("id")
            }
        },
        upsert=True
    )
    
    return {"message": "Role permissions updated successfully", "permissions": data.permissions}

@api_router.get("/role-permissions/check/{feature}/{action}")
async def check_permission(
    feature: str,
    action: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if current user has permission for a specific feature and action"""
    user_role = current_user.get("role", "client")
    
    # Get permissions
    permissions_doc = await db.role_permissions.find_one({"type": "master"})
    permissions = permissions_doc.get("permissions", DEFAULT_ROLE_PERMISSIONS) if permissions_doc else DEFAULT_ROLE_PERMISSIONS
    
    # Find matching permission
    for perm in permissions:
        if perm.get("feature") == feature and perm.get("action") == action:
            has_permission = perm.get(user_role, False)
            return {
                "feature": feature,
                "action": action,
                "user_role": user_role,
                "has_permission": has_permission,
                "description": perm.get("description", "")
            }
    
    # Default to False if permission not found
    return {
        "feature": feature,
        "action": action,
        "user_role": user_role,
        "has_permission": False,
        "description": "Permission not defined"
    }

@api_router.get("/role-permissions/user")
async def get_user_permissions(current_user: dict = Depends(get_current_user)):
    """Get all permissions for the current user based on their role"""
    user_role = current_user.get("role", "client")
    
    # Get permissions
    permissions_doc = await db.role_permissions.find_one({"type": "master"})
    permissions = permissions_doc.get("permissions", DEFAULT_ROLE_PERMISSIONS) if permissions_doc else DEFAULT_ROLE_PERMISSIONS
    
    # Filter permissions for user's role
    user_permissions = {}
    for perm in permissions:
        feature = perm.get("feature")
        action = perm.get("action")
        has_permission = perm.get(user_role, False)
        
        if feature not in user_permissions:
            user_permissions[feature] = {}
        user_permissions[feature][action] = has_permission
    
    return {
        "user_role": user_role,
        "permissions": user_permissions
    }

@api_router.post("/role-permissions/reset")
async def reset_role_permissions(current_user: dict = Depends(get_current_user)):
    """Reset role permissions to default. Only brokers can reset."""
    if current_user.get("role") != "broker":
        raise HTTPException(status_code=403, detail="Only brokers can reset role permissions")
    
    await db.role_permissions.update_one(
        {"type": "master"},
        {
            "$set": {
                "permissions": DEFAULT_ROLE_PERMISSIONS,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user.get("id"),
                "reset_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    return {"message": "Role permissions reset to default", "permissions": DEFAULT_ROLE_PERMISSIONS}


async def register_user(user_data: UserCreate):
    """Register a new user (broker or sub-broker)"""
    # Check if PAN already exists
    existing = await db.users.find_one({"pan": user_data.pan.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="PAN already registered")
    
    # Validate role
    if user_data.role not in ["broker", "sub_broker"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Create user
    user = {
        "id": str(uuid.uuid4()),
        "pan": user_data.pan.upper(),
        "name": user_data.name,
        "email": user_data.email,
        "phone": user_data.phone,
        "password_hash": get_password_hash(user_data.password),
        "pin_hash": get_password_hash(user_data.pin),
        "role": user_data.role,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user)
    
    return {
        "id": user['id'],
        "pan": user['pan'],
        "name": user['name'],
        "role": user['role']
    }


# Partner Models and Routes
class PartnerCreate(BaseModel):
    name: str
    pan: str
    partner_code: str
    email: str
    mobile: str
    color: str
    address_line1: str
    address_line2: str
    city: str
    country: str
    state: str
    pincode: str
    password: str
    pin: str


class Partner(BaseModel):
    id: str
    name: str
    pan: str
    partner_code: str
    email: str
    mobile: str
    color: str
    address_line1: str
    address_line2: str
    city: str
    country: str
    state: str
    pincode: str
    created_by: str
    last_log: Optional[str] = None
    created_at: datetime


@api_router.post("/partners")
async def create_partner(partner_data: PartnerCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Create a new sub-broker partner (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can create partners")
    
    # Check if PAN already exists
    existing_user = await db.users.find_one({"pan": partner_data.pan.upper()})
    if existing_user:
        raise HTTPException(status_code=400, detail="PAN already registered")
    
    # Check if partner code already exists
    existing_partner = await db.partners.find_one({"partner_code": partner_data.partner_code})
    if existing_partner:
        raise HTTPException(status_code=400, detail="Partner code already exists")
    
    # Create user account for the partner
    user = {
        "id": str(uuid.uuid4()),
        "pan": partner_data.pan.upper(),
        "name": partner_data.name,
        "email": partner_data.email,
        "phone": partner_data.mobile,
        "password_hash": get_password_hash(partner_data.password),
        "pin_hash": get_password_hash(partner_data.pin),
        "role": "sub_broker",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    
    # Create partner record
    partner = {
        "id": user['id'],
        "name": partner_data.name,
        "pan": partner_data.pan.upper(),
        "partner_code": partner_data.partner_code,
        "email": partner_data.email,
        "mobile": partner_data.mobile,
        "color": partner_data.color,
        "address_line1": partner_data.address_line1,
        "address_line2": partner_data.address_line2,
        "city": partner_data.city,
        "country": partner_data.country,
        "state": partner_data.state,
        "pincode": partner_data.pincode,
        "created_by": current_user['id'],
        "last_log": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Store plain credentials for display to broker (not best practice but per user request)
        "initial_password": partner_data.password,
        "initial_pin": partner_data.pin
    }
    await db.partners.insert_one(partner)
    
    # Send welcome email in background (if email is provided)
    if partner_data.email:
        background_tasks.add_task(
            send_welcome_email_subbroker,
            subbroker_name=partner_data.name,
            subbroker_email=partner_data.email,
            pan=partner_data.pan.upper(),
            password=partner_data.password,
            pin=partner_data.pin,
            partner_code=partner_data.partner_code,
            broker_name=current_user.get('name', 'Your Broker')
        )
    
    return {
        "id": partner['id'],
        "name": partner['name'],
        "partner_code": partner['partner_code'],
        "email": partner['email']
    }


@api_router.get("/partners")
async def get_partners(current_user: dict = Depends(get_current_user)):
    """Get all partners created by the broker"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can view partners")
    
    partners = await db.partners.find({"created_by": current_user['id']}, {"_id": 0}).to_list(1000)
    
    for partner in partners:
        if isinstance(partner.get('created_at'), str):
            partner['created_at'] = datetime.fromisoformat(partner['created_at'])
    
    return partners


@api_router.delete("/partners/{partner_id}")
async def delete_partner(partner_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a sub-broker partner (brokers only) - marks as inactive if has trades"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete partners")
    
    # Check if partner exists and belongs to this broker
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Check if sub-broker has any confirmed trades or linked clients with trades
    trades = await db.trades.find({"created_by": partner_id, "status": "approved"}).to_list(1)
    linked_clients = await db.clients.find({"linked_subbroker_id": partner_id}).to_list(1)
    
    if trades or linked_clients:
        # Soft delete - mark as inactive
        await db.partners.update_one(
            {"id": partner_id},
            {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.users.update_one(
            {"id": partner_id},
            {"$set": {"is_active": False}}
        )
        return {"message": "Sub-broker marked as inactive (has trades or linked clients)", "soft_delete": True}
    else:
        # Hard delete - no trades or linked clients
        await db.partners.delete_one({"id": partner_id})
        await db.users.delete_one({"id": partner_id})
        return {"message": "Sub-broker deleted successfully", "soft_delete": False}


@api_router.post("/partners/{partner_id}/reactivate")
async def reactivate_partner(partner_id: str, current_user: dict = Depends(get_current_user)):
    """Reactivate an inactive sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can reactivate partners")
    
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    await db.partners.update_one(
        {"id": partner_id},
        {"$set": {"is_active": True}, "$unset": {"deactivated_at": ""}}
    )
    await db.users.update_one(
        {"id": partner_id},
        {"$set": {"is_active": True}}
    )
    
    return {"message": "Sub-broker reactivated successfully"}


@api_router.post("/partners/{partner_id}/deactivate")
async def deactivate_partner(partner_id: str, current_user: dict = Depends(get_current_user)):
    """Deactivate a sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can deactivate partners")
    
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    await db.partners.update_one(
        {"id": partner_id},
        {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.users.update_one(
        {"id": partner_id},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Sub-broker deactivated successfully"}


@api_router.post("/partners/{partner_id}/resend-credentials")
async def resend_partner_credentials(
    partner_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Resend login credentials email to sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can resend credentials")
    
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    if not partner.get('email'):
        raise HTTPException(status_code=400, detail="Sub-broker does not have an email address")
    
    # Get stored credentials
    initial_password = partner.get('initial_password')
    initial_pin = partner.get('initial_pin')
    
    if not initial_password or not initial_pin:
        raise HTTPException(
            status_code=400, 
            detail="Original credentials not stored. Please use Reset Password instead."
        )
    
    # Send email in background
    background_tasks.add_task(
        send_welcome_email_subbroker,
        subbroker_name=partner['name'],
        subbroker_email=partner['email'],
        pan=partner['pan'],
        password=initial_password,
        pin=initial_pin,
        partner_code=partner.get('partner_code', ''),
        broker_name=current_user.get('name', 'Admin')
    )
    
    return {"message": f"Credentials sent to {partner['email']}"}


@api_router.post("/partners/{partner_id}/reset-password")
async def reset_partner_password(
    partner_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Reset password for a sub-broker and send email (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can reset passwords")
    
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Generate new password and PIN
    new_password = generate_password()
    new_pin = generate_pin()
    
    # Update user credentials
    await db.users.update_one(
        {"id": partner_id},
        {"$set": {
            "password_hash": get_password_hash(new_password),
            "pin_hash": get_password_hash(new_pin)
        }}
    )
    
    # Update stored credentials in partner record
    await db.partners.update_one(
        {"id": partner_id},
        {"$set": {
            "initial_password": new_password,
            "initial_pin": new_pin,
            "password_reset_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Send email if partner has email
    if partner.get('email'):
        background_tasks.add_task(
            send_welcome_email_subbroker,
            subbroker_name=partner['name'],
            subbroker_email=partner['email'],
            pan=partner['pan'],
            password=new_password,
            pin=new_pin,
            partner_code=partner.get('partner_code', ''),
            broker_name=current_user.get('name', 'Admin')
        )
        return {"message": f"Password reset and sent to {partner['email']}"}
    else:
        return {
            "message": "Password reset successfully",
            "new_password": new_password,
            "new_pin": new_pin
        }


# ==================== SUB-BROKER PROFILE ENDPOINTS ====================

@api_router.get("/sub-broker/profile")
async def get_sub_broker_profile(current_user: dict = Depends(get_current_user)):
    """Get sub-broker profile information"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can access this endpoint")
    
    partner = await db.partners.find_one({"id": current_user['id']}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Count linked clients
    linked_clients = await db.clients.count_documents({"linked_subbroker_id": current_user['id']})
    
    return {
        "id": partner.get('id'),
        "name": partner.get('name'),
        "email": partner.get('email'),
        "mobile": partner.get('mobile') or partner.get('phone'),
        "phone": partner.get('phone') or partner.get('mobile'),
        "pan": partner.get('pan'),
        "partner_code": partner.get('partner_code'),
        "is_active": partner.get('is_active', True),
        "created_at": partner.get('created_at'),
        "linked_clients_count": linked_clients
    }


@api_router.put("/sub-broker/profile/email")
async def update_sub_broker_email(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update sub-broker email address"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can update their profile")
    
    email = data.get('email', '').strip()
    if not email or '@' not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    
    # Check if email is already used
    existing = await db.partners.find_one({"email": email, "id": {"$ne": current_user['id']}})
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use by another account")
    
    await db.partners.update_one(
        {"id": current_user['id']},
        {"$set": {"email": email, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"email": email}}
    )
    
    return {"message": "Email updated successfully"}


@api_router.put("/sub-broker/profile/phone")
async def update_sub_broker_phone(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update sub-broker phone number"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can update their profile")
    
    phone = data.get('phone', '').strip()
    if not phone or len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    
    await db.partners.update_one(
        {"id": current_user['id']},
        {"$set": {"mobile": phone, "phone": phone, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Phone number updated successfully"}


@api_router.put("/sub-broker/profile/password")
async def update_sub_broker_password(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update sub-broker password"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can update their password")
    
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Current and new passwords are required")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Verify current password
    user = await db.users.find_one({"id": current_user['id']})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not verify_password(current_password, user.get('password_hash', '')):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"password_hash": get_password_hash(new_password)}}
    )
    
    return {"message": "Password updated successfully"}


@api_router.put("/sub-broker/profile/pin")
async def update_sub_broker_pin(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update sub-broker PIN"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can update their PIN")
    
    current_pin = data.get('current_pin', '')
    new_pin = data.get('new_pin', '')
    
    if not current_pin or not new_pin:
        raise HTTPException(status_code=400, detail="Current and new PINs are required")
    
    if len(new_pin) != 4 or not new_pin.isdigit():
        raise HTTPException(status_code=400, detail="New PIN must be exactly 4 digits")
    
    # Verify current PIN
    user = await db.users.find_one({"id": current_user['id']})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not verify_password(current_pin, user.get('pin_hash', '')):
        raise HTTPException(status_code=400, detail="Current PIN is incorrect")
    
    # Update PIN
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"pin_hash": get_password_hash(new_pin)}}
    )
    
    return {"message": "PIN updated successfully"}


@api_router.put("/sub-broker/profile/address")
async def update_sub_broker_address(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update sub-broker address"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can update their address")
    
    update_data = {
        "address_line1": data.get('address_line1', ''),
        "address_line2": data.get('address_line2', ''),
        "city": data.get('city', ''),
        "state": data.get('state', ''),
        "pincode": data.get('pincode', ''),
        "country": data.get('country', 'India')
    }
    
    await db.partners.update_one(
        {"id": current_user['id']},
        {"$set": update_data}
    )
    
    return {"message": "Address updated successfully"}


# ==================== SUB-BROKER CLIENT MANAGEMENT ====================

@api_router.get("/sub-broker/clients")
async def get_sub_broker_clients(current_user: dict = Depends(get_current_user)):
    """Get clients linked to this sub-broker"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can access this endpoint")
    
    clients = await db.clients.find(
        {"linked_subbroker_id": current_user['id']},
        {"_id": 0}
    ).to_list(1000)
    
    return clients


@api_router.get("/sub-broker/clients/{client_id}")
async def get_sub_broker_client_details(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed info for a specific client linked to this sub-broker"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can access this endpoint")
    
    client = await db.clients.find_one(
        {"id": client_id, "linked_subbroker_id": current_user['id']},
        {"_id": 0}
    )
    
    if not client:
        raise HTTPException(status_code=404, detail="Client not found or not linked to you")
    
    return client


@api_router.put("/sub-broker/clients/{client_id}")
async def update_sub_broker_client(client_id: str, client_data: dict, current_user: dict = Depends(get_current_user)):
    """Update client details by sub-broker"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can access this endpoint")
    
    # Verify client is linked to this sub-broker
    existing_client = await db.clients.find_one(
        {"id": client_id, "linked_subbroker_id": current_user['id']},
        {"_id": 0}
    )
    
    if not existing_client:
        raise HTTPException(status_code=404, detail="Client not found or not linked to you")
    
    # Fields that can be updated
    allowed_fields = [
        'name', 'email', 'mobile', 'date_of_birth', 'father_husband_name', 'occupation',
        'demat_account_no', 'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
        'bank_name', 'account_number', 'branch', 'ifsc_code',
        'nominee_name', 'nominee_relationship', 'nominee_dob', 'nominee_mobile'
    ]
    
    update_data = {k: v for k, v in client_data.items() if k in allowed_fields and v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    if update_data:
        await db.clients.update_one(
            {"id": client_id},
            {"$set": update_data}
        )
    
    # Return updated client
    updated_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return updated_client


@api_router.post("/sub-broker/clients")
async def create_client_by_subbroker(
    client_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a new client (requires broker approval)"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can use this endpoint")
    
    # Get the broker associated with this sub-broker
    partner = await db.partners.find_one({"id": current_user['id']}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    broker_id = partner.get('created_by') or partner.get('broker_id')
    
    # Determine PAN - could be pan_number or pan
    pan = client_data.get('pan_number', client_data.get('pan', '')).upper()
    passport_type = client_data.get('passport_type', 'indian')
    original_pan = pan
    is_role_overlap = False
    login_id = pan
    
    # Check if PAN/Passport already exists
    if passport_type == 'indian' and pan:
        existing = await db.clients.find_one({"$or": [{"pan": pan}, {"pan_number": pan}]})
        if existing:
            raise HTTPException(status_code=400, detail="Client with this PAN already exists")
        
        # ROLE OVERLAP HANDLING: Check if PAN exists as sub-broker OR broker
        existing_user = await db.users.find_one({"pan": pan})
        if existing_user:
            if existing_user.get('role') in ['sub_broker', 'broker']:
                # Create client login with PAN + "1" suffix for role overlap
                login_id = f"{pan}1"
                is_role_overlap = True
                
                # Verify the modified login_id doesn't exist
                existing_modified = await db.users.find_one({"pan": login_id})
                if existing_modified:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Client login for {existing_user.get('role')} PAN {pan} already exists (Login: {login_id})"
                    )
            else:
                raise HTTPException(status_code=400, detail="User with this PAN already exists")
    elif passport_type == 'foreign':
        passport_number = client_data.get('passport_number', '').upper()
        if passport_number:
            existing = await db.clients.find_one({"passport_number": passport_number})
            if existing:
                raise HTTPException(status_code=400, detail="Client with this passport number already exists")
            login_id = passport_number
    
    # Generate client ID
    client_id = str(uuid.uuid4())
    
    # Generate temporary password and PIN
    temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    temp_pin = ''.join(random.choices(string.digits, k=4))
    
    # Create client with pending approval status - include ALL fields from broker modal
    new_client = {
        "id": client_id,
        "pan": login_id,  # Login ID (PAN or PAN+1 for role overlap)
        "pan_number": pan,  # Original PAN stored separately
        "original_pan": original_pan,
        "is_role_overlap": is_role_overlap,
        "name": client_data.get('name', ''),
        "email": client_data.get('email', ''),
        "phone": client_data.get('mobile', client_data.get('phone', '')),
        "mobile": client_data.get('mobile', client_data.get('phone', '')),
        "password_hash": get_password_hash(temp_password),
        "pin_hash": get_password_hash(temp_pin),
        "default_password": temp_password,
        "default_pin": temp_pin,
        "role": "client",
        "broker_id": broker_id,
        "linked_subbroker_id": current_user['id'],
        "created_by_subbroker": True,
        "approval_status": "pending_approval",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "is_active": False,
        
        # Passport & Residency
        "passport_type": passport_type,
        "country_of_residency": client_data.get('country_of_residency', ''),
        "passport_number": client_data.get('passport_number', ''),
        "emirates_id": client_data.get('emirates_id', ''),
        "emirates_id_expiry": client_data.get('emirates_id_expiry', ''),
        "passport_valid_from": client_data.get('passport_valid_from', ''),
        "passport_valid_until": client_data.get('passport_valid_until', ''),
        "passport_country_of_issue": client_data.get('passport_country_of_issue', ''),
        
        # Opportunities
        "opportunities": client_data.get('opportunities', []),
        
        # Indian Bank Details (for bonds)
        "demat_account_no": client_data.get('demat_account_no', ''),
        "bank_name": client_data.get('bank_name', ''),
        "account_number": client_data.get('account_number', ''),
        "branch": client_data.get('branch', ''),
        "ifsc_code": client_data.get('ifsc_code', ''),
        "account_type": client_data.get('account_type', ''),
        
        # International Bank Details (for NRIs)
        "intl_bank_name": client_data.get('intl_bank_name', ''),
        "intl_account_number": client_data.get('intl_account_number', ''),
        "intl_iban": client_data.get('intl_iban', ''),
        "intl_swift_code": client_data.get('intl_swift_code', ''),
        
        # Additional Details
        "occupation": client_data.get('occupation', ''),
        "date_of_birth": client_data.get('date_of_birth', ''),
        "father_husband_name": client_data.get('father_husband_name', ''),
        
        # Address
        "address_line1": client_data.get('address_line1', ''),
        "address_line2": client_data.get('address_line2', ''),
        "city": client_data.get('city', ''),
        "state": client_data.get('state', ''),
        "country": client_data.get('country', ''),
        "pincode": client_data.get('pincode', ''),
        
        # Nominee Details
        "nominee_name": client_data.get('nominee_name', ''),
        "nominee_dob": client_data.get('nominee_dob', ''),
        "nominee_mobile": client_data.get('nominee_mobile', ''),
        "nominee_relationship": client_data.get('nominee_relationship', ''),
        
        # UCCs
        "ucc_list": client_data.get('ucc_list', []),
        "bond_allocations": [],
        "notes": client_data.get('notes', '')
    }
    
    await db.clients.insert_one(new_client)
    
    # Clean response
    response_client = {k: v for k, v in new_client.items() if k != '_id'}
    
    return {
        "message": "Client created successfully. Pending broker approval.",
        "client": response_client,
        "default_password": temp_password,
        "default_pin": temp_pin,
        "requires_approval": True
    }


# ==================== SUB-BROKER BULK UPLOAD ====================

@api_router.post("/sub-broker/bulk/clients-indian")
async def sub_broker_bulk_upload_indian_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload Indian passport clients by sub-broker (requires broker approval)"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can use this endpoint")
    
    # Get the broker associated with this sub-broker
    partner = await db.partners.find_one({"id": current_user['id']}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    broker_id = partner.get('created_by') or partner.get('broker_id')
    
    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), sheet_name=0)
        
        # Normalize column names
        df.columns = [col.strip().lower().replace(' ', '_').replace('*', '') for col in df.columns]
        
        created = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                pan = str(row.get('pan_number', row.get('pan', ''))).strip().upper()
                if not pan or pan == 'NAN':
                    continue
                
                # Check if already exists
                existing = await db.clients.find_one({"$or": [{"pan": pan}, {"pan_number": pan}]})
                if existing:
                    errors.append(f"Row {idx+2}: PAN {pan} already exists")
                    continue
                
                client_id = str(uuid.uuid4())
                temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
                temp_pin = ''.join(random.choices(string.digits, k=4))
                
                new_client = {
                    "id": client_id,
                    "pan": pan,
                    "pan_number": pan,
                    "name": str(row.get('name', '')).strip(),
                    "email": str(row.get('email', '')).strip(),
                    "mobile": str(row.get('mobile', row.get('phone', ''))).strip(),
                    "phone": str(row.get('mobile', row.get('phone', ''))).strip(),
                    "password_hash": get_password_hash(temp_password),
                    "pin_hash": get_password_hash(temp_pin),
                    "default_password": temp_password,
                    "default_pin": temp_pin,
                    "role": "client",
                    "broker_id": broker_id,
                    "linked_subbroker_id": current_user['id'],
                    "created_by_subbroker": True,
                    "approval_status": "pending_approval",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "is_active": False,
                    "passport_type": "indian",
                    "country_of_residency": str(row.get('country_of_residency', 'India')).strip(),
                    "demat_account_no": str(row.get('demat_account_no', '')).strip(),
                    "bank_name": str(row.get('bank_name', '')).strip(),
                    "account_number": str(row.get('account_number', '')).strip(),
                    "branch": str(row.get('branch', '')).strip(),
                    "ifsc_code": str(row.get('ifsc_code', '')).strip().upper(),
                    "city": str(row.get('city', '')).strip(),
                    "state": str(row.get('state', '')).strip(),
                    "pincode": str(row.get('pincode', '')).strip(),
                    "country": str(row.get('country', 'India')).strip(),
                    "ucc_list": [],
                    "bond_allocations": []
                }
                
                await db.clients.insert_one(new_client)
                created += 1
                
            except Exception as e:
                errors.append(f"Row {idx+2}: {str(e)}")
        
        return {
            "created": created,
            "errors": errors[:10],
            "message": f"Successfully uploaded {created} clients. All pending broker approval."
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")


@api_router.post("/sub-broker/bulk/clients-foreign")
async def sub_broker_bulk_upload_foreign_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload foreign passport clients by sub-broker (requires broker approval)"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can use this endpoint")
    
    # Get the broker associated with this sub-broker
    partner = await db.partners.find_one({"id": current_user['id']}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    broker_id = partner.get('created_by') or partner.get('broker_id')
    
    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), sheet_name=0)
        
        # Normalize column names
        df.columns = [col.strip().lower().replace(' ', '_').replace('*', '') for col in df.columns]
        
        created = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                passport_number = str(row.get('passport_number', '')).strip().upper()
                if not passport_number or passport_number == 'NAN':
                    continue
                
                # Check if already exists
                existing = await db.clients.find_one({"passport_number": passport_number})
                if existing:
                    errors.append(f"Row {idx+2}: Passport {passport_number} already exists")
                    continue
                
                client_id = str(uuid.uuid4())
                temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
                temp_pin = ''.join(random.choices(string.digits, k=4))
                
                new_client = {
                    "id": client_id,
                    "passport_number": passport_number,
                    "pan": "",
                    "pan_number": "",
                    "name": str(row.get('name', '')).strip(),
                    "email": str(row.get('email', '')).strip(),
                    "mobile": str(row.get('mobile', row.get('phone', ''))).strip(),
                    "phone": str(row.get('mobile', row.get('phone', ''))).strip(),
                    "password_hash": get_password_hash(temp_password),
                    "pin_hash": get_password_hash(temp_pin),
                    "default_password": temp_password,
                    "default_pin": temp_pin,
                    "role": "client",
                    "broker_id": broker_id,
                    "linked_subbroker_id": current_user['id'],
                    "created_by_subbroker": True,
                    "approval_status": "pending_approval",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "is_active": False,
                    "passport_type": "foreign",
                    "country_of_residency": str(row.get('country_of_residency', '')).strip(),
                    "passport_country_of_issue": str(row.get('passport_country_of_issue', '')).strip(),
                    "emirates_id": str(row.get('emirates_id', '')).strip(),
                    "emirates_id_expiry": str(row.get('emirates_id_expiry', '')).strip(),
                    "intl_bank_name": str(row.get('bank_name', row.get('intl_bank_name', ''))).strip(),
                    "intl_account_number": str(row.get('account_number', row.get('intl_account_number', ''))).strip(),
                    "intl_iban": str(row.get('iban', row.get('intl_iban', ''))).strip(),
                    "intl_swift_code": str(row.get('swift_code', row.get('intl_swift_code', ''))).strip().upper(),
                    "city": str(row.get('city', '')).strip(),
                    "state": str(row.get('state', '')).strip(),
                    "country": str(row.get('country', '')).strip(),
                    "ucc_list": [],
                    "bond_allocations": []
                }
                
                await db.clients.insert_one(new_client)
                created += 1
                
            except Exception as e:
                errors.append(f"Row {idx+2}: {str(e)}")
        
        return {
            "created": created,
            "errors": errors[:10],
            "message": f"Successfully uploaded {created} clients. All pending broker approval."
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")


@api_router.get("/sub-broker/pending-approvals")
async def get_subbroker_pending_approvals(current_user: dict = Depends(get_current_user)):
    """Get items pending approval created by this sub-broker"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can access this endpoint")
    
    pending_clients = await db.clients.find(
        {
            "linked_subbroker_id": current_user['id'],
            "approval_status": "pending_approval"
        },
        {"_id": 0}
    ).to_list(100)
    
    return {
        "pending_clients": pending_clients
    }


# ==================== BROKER APPROVAL ENDPOINTS ====================

@api_router.get("/broker/pending-approvals")
async def get_broker_pending_approvals(current_user: dict = Depends(get_current_user)):
    """Get all items pending broker approval"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this endpoint")
    
    # Get pending clients created by sub-brokers
    pending_clients = await db.clients.find(
        {
            "broker_id": current_user['id'],
            "approval_status": "pending_approval"
        },
        {"_id": 0}
    ).to_list(100)
    
    # Get pending reinvestment tags
    pending_reinvestments = await db.reinvestment_approvals.find(
        {
            "broker_id": current_user['id'],
            "broker_approval_status": "pending"
        },
        {"_id": 0}
    ).to_list(100)
    
    return {
        "pending_clients": pending_clients,
        "pending_reinvestments": pending_reinvestments
    }


@api_router.post("/broker/approve-client/{client_id}")
async def approve_client(
    client_id: str,
    action: str = Query(..., description="approve or reject"),
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject a client created by sub-broker"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can approve clients")
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if client.get('broker_id') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to approve this client")
    
    if action == "approve":
        await db.clients.update_one(
            {"id": client_id},
            {
                "$set": {
                    "approval_status": "approved",
                    "is_active": True,
                    "approved_at": datetime.now(timezone.utc).isoformat(),
                    "approved_by": current_user['id']
                }
            }
        )
        
        # Send welcome email with credentials
        if client.get('email'):
            from email_service import send_welcome_email_client
            broker = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
            send_welcome_email_client(
                client_name=client.get('name', ''),
                client_email=client.get('email'),
                pan=client.get('pan', ''),
                password=client.get('default_password', '') or client.get('temp_password', ''),
                pin=client.get('default_pin', '') or client.get('temp_pin', ''),
                broker_name=broker.get('name', 'Your Broker') if broker else 'Your Broker'
            )
        
        return {"message": "Client approved successfully", "status": "approved"}
    
    elif action == "reject":
        await db.clients.update_one(
            {"id": client_id},
            {
                "$set": {
                    "approval_status": "rejected",
                    "rejected_at": datetime.now(timezone.utc).isoformat(),
                    "rejected_by": current_user['id']
                }
            }
        )
        return {"message": "Client rejected", "status": "rejected"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'")


# ==================== APPROVAL WORKFLOW SYSTEM ====================

class ApprovalLogEntry(BaseModel):
    """Model for creating approval log entries"""
    entity_type: str  # 'client' or 'reinvestment'
    entity_id: str
    action: str  # 'submitted', 'broker_approved', 'broker_rejected', 'client_approved', 'client_rejected', 'api_submitted'
    notes: Optional[str] = None


async def create_approval_log(
    entity_type: str,
    entity_id: str,
    action: str,
    actor_id: str,
    actor_role: str,
    actor_name: str,
    details: dict = None,
    notes: str = None
):
    """Helper to create approval log entries"""
    log_entry = {
        "id": str(uuid.uuid4()),
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "actor_name": actor_name,
        "details": details or {},
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.approval_logs.insert_one(log_entry)
    return log_entry


@api_router.get("/approval-logs")
async def get_approval_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get approval logs based on user role"""
    query = {}
    
    if current_user['role'] == 'broker':
        # Broker sees all logs for their entities
        broker_id = current_user['id']
        # Get all clients and sub-brokers under this broker
        client_ids = await db.clients.distinct("id", {"broker_id": broker_id})
        partner_ids = await db.partners.distinct("id", {"created_by": broker_id})
        query["$or"] = [
            {"actor_id": broker_id},
            {"entity_id": {"$in": client_ids + partner_ids}},
            {"details.broker_id": broker_id}
        ]
    elif current_user['role'] == 'sub_broker':
        # Sub-broker sees logs for their submissions
        query["$or"] = [
            {"actor_id": current_user['id']},
            {"details.sub_broker_id": current_user['id']}
        ]
    elif current_user['role'] == 'client':
        # Client sees logs for their approvals
        client = await db.clients.find_one({"user_id": current_user['id']})
        if client:
            query["entity_id"] = client['id']
    
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    
    logs = await db.approval_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return logs


@api_router.get("/approval-workflow/pending")
async def get_pending_approvals_workflow(current_user: dict = Depends(get_current_user)):
    """Get all pending approvals for the approval workflow page"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can view pending approvals")
    
    # Get pending clients from sub-brokers
    pending_clients = await db.clients.find(
        {
            "broker_id": current_user['id'],
            "approval_status": "pending_approval"
        },
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with sub-broker info
    for client in pending_clients:
        if client.get('linked_subbroker_id'):
            sub_broker = await db.partners.find_one(
                {"id": client['linked_subbroker_id']},
                {"_id": 0, "name": 1, "partner_code": 1}
            )
            client['sub_broker_name'] = sub_broker.get('name') if sub_broker else 'Unknown'
            client['sub_broker_code'] = sub_broker.get('partner_code') if sub_broker else ''
    
    # Get pending reinvestments from sub-brokers
    pending_reinvestments = await db.reinvestment_submissions.find(
        {
            "broker_id": current_user['id'],
            "broker_approval_status": "pending"
        },
        {"_id": 0}
    ).to_list(100)
    
    # Enrich reinvestments with client and sub-broker info
    for reinv in pending_reinvestments:
        if reinv.get('client_id'):
            client = await db.clients.find_one(
                {"id": reinv['client_id']},
                {"_id": 0, "name": 1, "pan_number": 1}
            )
            reinv['client_name'] = client.get('name') if client else 'Unknown'
            reinv['client_pan'] = client.get('pan_number') if client else ''
        if reinv.get('sub_broker_id'):
            sub_broker = await db.partners.find_one(
                {"id": reinv['sub_broker_id']},
                {"_id": 0, "name": 1, "partner_code": 1}
            )
            reinv['sub_broker_name'] = sub_broker.get('name') if sub_broker else 'Unknown'
            reinv['sub_broker_code'] = sub_broker.get('partner_code') if sub_broker else ''
    
    return {
        "pending_clients": pending_clients,
        "pending_reinvestments": pending_reinvestments,
        "total_pending": len(pending_clients) + len(pending_reinvestments)
    }


class ClientApprovalRequest(BaseModel):
    action: str  # 'approve' or 'reject'
    notes: Optional[str] = None
    send_client_email: bool = True  # Whether to send approval email to client


@api_router.post("/approval-workflow/client/{client_id}")
async def process_client_approval(
    client_id: str,
    request: ClientApprovalRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Process client approval/rejection by broker and optionally send client email"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can approve clients")
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if client.get('broker_id') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to approve this client")
    
    if request.action == "approve":
        # Generate approval token for client email
        approval_token = create_access_token(
            data={
                "type": "client_approval",
                "client_id": client_id,
                "broker_id": current_user['id']
            },
            expires_delta=timedelta(days=7)  # Token valid for 7 days
        )
        
        # Update client status to broker_approved
        await db.clients.update_one(
            {"id": client_id},
            {
                "$set": {
                    "broker_approval_status": "approved",
                    "broker_approved_at": datetime.now(timezone.utc).isoformat(),
                    "broker_approved_by": current_user['id'],
                    "client_approval_status": "pending" if request.send_client_email else "not_required",
                    "approval_token": approval_token
                }
            }
        )
        
        # Create log entry
        await create_approval_log(
            entity_type="client",
            entity_id=client_id,
            action="broker_approved",
            actor_id=current_user['id'],
            actor_role="broker",
            actor_name=current_user.get('name', 'Broker'),
            details={
                "client_name": client.get('name'),
                "sub_broker_id": client.get('linked_subbroker_id'),
                "broker_id": current_user['id']
            },
            notes=request.notes
        )
        
        # Send client approval email if requested
        if request.send_client_email and client.get('email'):
            from email_service import send_client_approval_request_email
            background_tasks.add_task(
                send_client_approval_request_email,
                client_name=client.get('name', ''),
                client_email=client.get('email'),
                approval_token=approval_token,
                broker_name=current_user.get('name', 'Your Broker')
            )
            
        return {
            "message": "Client approved by broker" + (" - approval email sent to client" if request.send_client_email else ""),
            "status": "broker_approved",
            "client_approval_pending": request.send_client_email
        }
    
    elif request.action == "reject":
        await db.clients.update_one(
            {"id": client_id},
            {
                "$set": {
                    "approval_status": "rejected",
                    "broker_approval_status": "rejected",
                    "rejected_at": datetime.now(timezone.utc).isoformat(),
                    "rejected_by": current_user['id'],
                    "rejection_notes": request.notes
                }
            }
        )
        
        # Create log entry
        await create_approval_log(
            entity_type="client",
            entity_id=client_id,
            action="broker_rejected",
            actor_id=current_user['id'],
            actor_role="broker",
            actor_name=current_user.get('name', 'Broker'),
            details={
                "client_name": client.get('name'),
                "sub_broker_id": client.get('linked_subbroker_id'),
                "broker_id": current_user['id']
            },
            notes=request.notes
        )
        
        return {"message": "Client rejected", "status": "rejected"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'")


@api_router.get("/approval-workflow/client-approve")
async def client_approve_via_link(token: str, action: str = "approve"):
    """Public endpoint for client to approve via email link - NO AUTH REQUIRED"""
    try:
        payload = verify_token(token)
        if not payload or payload.get("type") != "client_approval":
            return {"success": False, "message": "Invalid or expired approval link"}
        
        client_id = payload.get("client_id")
        
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            return {"success": False, "message": "Client not found"}
        
        approved = action.lower() == "approve"
        
        if approved:
            # Final approval - activate client account
            temp_password = generate_password()
            temp_pin = generate_pin()
            
            # Create user account for client
            user_id = str(uuid.uuid4())
            await db.users.insert_one({
                "id": user_id,
                "pan": client.get('pan_number', '').upper(),
                "name": client.get('name', ''),
                "email": client.get('email', ''),
                "phone": client.get('mobile', ''),
                "password_hash": get_password_hash(temp_password),
                "pin_hash": get_password_hash(temp_pin),
                "role": "client",
                "client_id": client_id,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
            # Update client record
            await db.clients.update_one(
                {"id": client_id},
                {
                    "$set": {
                        "approval_status": "approved",
                        "client_approval_status": "approved",
                        "client_approved_at": datetime.now(timezone.utc).isoformat(),
                        "is_active": True,
                        "user_id": user_id,
                        "temp_password": temp_password,
                        "temp_pin": temp_pin
                    }
                }
            )
            
            # Create log entry
            await create_approval_log(
                entity_type="client",
                entity_id=client_id,
                action="client_approved",
                actor_id=client_id,
                actor_role="client",
                actor_name=client.get('name', 'Client'),
                details={"broker_id": client.get('broker_id')}
            )
            
            # Send welcome email with credentials
            if client.get('email'):
                broker = await db.users.find_one({"id": client.get('broker_id')}, {"_id": 0})
                from email_service import send_welcome_email_client
                send_welcome_email_client(
                    client_name=client.get('name', ''),
                    client_email=client.get('email'),
                    pan=client.get('pan_number', ''),
                    password=temp_password,
                    pin=temp_pin,
                    broker_name=broker.get('name', 'Your Broker') if broker else 'Your Broker'
                )
            
            return {
                "success": True,
                "message": "Your account has been approved! Check your email for login credentials.",
                "action": "approved"
            }
        else:
            await db.clients.update_one(
                {"id": client_id},
                {
                    "$set": {
                        "client_approval_status": "rejected",
                        "client_rejected_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            # Create log entry
            await create_approval_log(
                entity_type="client",
                entity_id=client_id,
                action="client_rejected",
                actor_id=client_id,
                actor_role="client",
                actor_name=client.get('name', 'Client'),
                details={"broker_id": client.get('broker_id')}
            )
            
            return {
                "success": True,
                "message": "You have declined the account creation.",
                "action": "rejected"
            }
            
    except Exception as e:
        logger.error(f"Error in client approval link: {e}")
        return {"success": False, "message": "Invalid or expired approval link"}


class ReinvestmentSubmissionRequest(BaseModel):
    """Request to submit reinvestment for approval"""
    client_id: str
    cashflow_ids: List[str]
    portfolio_category: str
    target_ucc: Optional[str] = None
    notes: Optional[str] = None


@api_router.post("/approval-workflow/submit-reinvestment")
async def submit_reinvestment_for_approval(
    request: ReinvestmentSubmissionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Sub-broker submits reinvestment tagging for broker approval"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can submit reinvestments for approval")
    
    # Verify client is linked to this sub-broker
    client = await db.clients.find_one(
        {"id": request.client_id, "linked_subbroker_id": current_user['id']},
        {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found or not linked to you")
    
    # Get cashflows
    cashflows = await db.holding_cashflows.find(
        {"id": {"$in": request.cashflow_ids}}
    ).to_list(100)
    
    if not cashflows:
        raise HTTPException(status_code=404, detail="No cashflows found")
    
    # Calculate total amount
    total_amount = sum(cf.get('net_amount', 0) for cf in cashflows)
    
    # Create submission record
    submission_id = str(uuid.uuid4())
    submission = {
        "id": submission_id,
        "sub_broker_id": current_user['id'],
        "broker_id": client.get('broker_id'),
        "client_id": request.client_id,
        "cashflow_ids": request.cashflow_ids,
        "portfolio_category": request.portfolio_category,
        "target_ucc": request.target_ucc,
        "total_amount": total_amount,
        "cashflows_count": len(cashflows),
        "broker_approval_status": "pending",
        "client_approval_status": "not_started",
        "kinntegra_status": "not_submitted",
        "notes": request.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.reinvestment_submissions.insert_one(submission)
    
    # Update cashflows with submission reference
    await db.holding_cashflows.update_many(
        {"id": {"$in": request.cashflow_ids}},
        {"$set": {
            "submission_id": submission_id,
            "approval_status": "pending_broker"
        }}
    )
    
    # Create log entry
    await create_approval_log(
        entity_type="reinvestment",
        entity_id=submission_id,
        action="submitted",
        actor_id=current_user['id'],
        actor_role="sub_broker",
        actor_name=current_user.get('name', 'Sub-Broker'),
        details={
            "client_id": request.client_id,
            "client_name": client.get('name'),
            "total_amount": total_amount,
            "cashflows_count": len(cashflows),
            "broker_id": client.get('broker_id'),
            "sub_broker_id": current_user['id']
        },
        notes=request.notes
    )
    
    return {
        "message": "Reinvestment submitted for broker approval",
        "submission_id": submission_id,
        "total_amount": total_amount,
        "cashflows_count": len(cashflows)
    }


class ReinvestmentApprovalRequest(BaseModel):
    action: str  # 'approve' or 'reject'
    notes: Optional[str] = None
    send_client_email: bool = True


@api_router.post("/approval-workflow/reinvestment/{submission_id}")
async def process_reinvestment_approval(
    submission_id: str,
    request: ReinvestmentApprovalRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Broker approves/rejects reinvestment submission"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can approve reinvestments")
    
    submission = await db.reinvestment_submissions.find_one(
        {"id": submission_id, "broker_id": current_user['id']},
        {"_id": 0}
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    client = await db.clients.find_one({"id": submission['client_id']}, {"_id": 0})
    
    if request.action == "approve":
        # Generate approval token for client
        approval_token = create_access_token(
            data={
                "type": "reinvestment_approval",
                "submission_id": submission_id,
                "client_id": submission['client_id'],
                "cashflow_ids": submission['cashflow_ids']
            },
            expires_delta=timedelta(days=7)
        )
        
        await db.reinvestment_submissions.update_one(
            {"id": submission_id},
            {
                "$set": {
                    "broker_approval_status": "approved",
                    "broker_approved_at": datetime.now(timezone.utc).isoformat(),
                    "broker_approved_by": current_user['id'],
                    "client_approval_status": "pending" if request.send_client_email else "not_required",
                    "approval_token": approval_token
                }
            }
        )
        
        # Update cashflows
        await db.holding_cashflows.update_many(
            {"id": {"$in": submission['cashflow_ids']}},
            {"$set": {"approval_status": "broker_approved"}}
        )
        
        # Create log entry
        await create_approval_log(
            entity_type="reinvestment",
            entity_id=submission_id,
            action="broker_approved",
            actor_id=current_user['id'],
            actor_role="broker",
            actor_name=current_user.get('name', 'Broker'),
            details={
                "client_id": submission['client_id'],
                "total_amount": submission['total_amount'],
                "sub_broker_id": submission['sub_broker_id'],
                "broker_id": current_user['id']
            },
            notes=request.notes
        )
        
        # Send client approval email
        if request.send_client_email and client and client.get('email'):
            from email_service import send_reinvestment_client_approval_email
            background_tasks.add_task(
                send_reinvestment_client_approval_email,
                client_name=client.get('name', ''),
                client_email=client.get('email'),
                total_amount=submission['total_amount'],
                cashflows_count=submission['cashflows_count'],
                approval_token=approval_token,
                broker_name=current_user.get('name', 'Your Broker')
            )
        
        return {
            "message": "Reinvestment approved" + (" - approval email sent to client" if request.send_client_email else ""),
            "status": "broker_approved"
        }
    
    elif request.action == "reject":
        await db.reinvestment_submissions.update_one(
            {"id": submission_id},
            {
                "$set": {
                    "broker_approval_status": "rejected",
                    "broker_rejected_at": datetime.now(timezone.utc).isoformat(),
                    "rejection_notes": request.notes
                }
            }
        )
        
        # Update cashflows
        await db.holding_cashflows.update_many(
            {"id": {"$in": submission['cashflow_ids']}},
            {"$set": {"approval_status": "broker_rejected"}}
        )
        
        # Create log entry
        await create_approval_log(
            entity_type="reinvestment",
            entity_id=submission_id,
            action="broker_rejected",
            actor_id=current_user['id'],
            actor_role="broker",
            actor_name=current_user.get('name', 'Broker'),
            details={
                "client_id": submission['client_id'],
                "sub_broker_id": submission['sub_broker_id'],
                "broker_id": current_user['id']
            },
            notes=request.notes
        )
        
        return {"message": "Reinvestment rejected", "status": "rejected"}
    
    raise HTTPException(status_code=400, detail="Invalid action")


@api_router.get("/approval-workflow/reinvestment-approve")
async def reinvestment_approve_via_link(token: str, action: str = "approve"):
    """Public endpoint for client to approve reinvestment via email link - NO AUTH REQUIRED"""
    try:
        payload = verify_token(token)
        if not payload or payload.get("type") != "reinvestment_approval":
            return {"success": False, "message": "Invalid or expired approval link"}
        
        submission_id = payload.get("submission_id")
        client_id = payload.get("client_id")
        cashflow_ids = payload.get("cashflow_ids", [])
        
        submission = await db.reinvestment_submissions.find_one({"id": submission_id}, {"_id": 0})
        if not submission:
            return {"success": False, "message": "Submission not found"}
        
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        
        approved = action.lower() == "approve"
        
        if approved:
            # Update submission
            await db.reinvestment_submissions.update_one(
                {"id": submission_id},
                {
                    "$set": {
                        "client_approval_status": "approved",
                        "client_approved_at": datetime.now(timezone.utc).isoformat(),
                        "kinntegra_status": "ready_to_submit"
                    }
                }
            )
            
            # Update cashflows
            await db.holding_cashflows.update_many(
                {"id": {"$in": cashflow_ids}},
                {"$set": {
                    "client_approved": True,
                    "approval_status": "client_approved"
                }}
            )
            
            # Create log entry
            await create_approval_log(
                entity_type="reinvestment",
                entity_id=submission_id,
                action="client_approved",
                actor_id=client_id,
                actor_role="client",
                actor_name=client.get('name', 'Client') if client else 'Client',
                details={
                    "broker_id": submission.get('broker_id'),
                    "sub_broker_id": submission.get('sub_broker_id')
                }
            )
            
            # Trigger Kinntegra API submission
            kinntegra_result = await submit_to_kinntegra_internal(submission_id)
            
            return {
                "success": True,
                "message": "Reinvestment approved! Your investment will be processed shortly.",
                "action": "approved",
                "kinntegra_status": kinntegra_result.get('status', 'pending')
            }
        else:
            await db.reinvestment_submissions.update_one(
                {"id": submission_id},
                {
                    "$set": {
                        "client_approval_status": "rejected",
                        "client_rejected_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            await db.holding_cashflows.update_many(
                {"id": {"$in": cashflow_ids}},
                {"$set": {"approval_status": "client_rejected"}}
            )
            
            # Create log entry
            await create_approval_log(
                entity_type="reinvestment",
                entity_id=submission_id,
                action="client_rejected",
                actor_id=client_id,
                actor_role="client",
                actor_name=client.get('name', 'Client') if client else 'Client',
                details={
                    "broker_id": submission.get('broker_id'),
                    "sub_broker_id": submission.get('sub_broker_id')
                }
            )
            
            return {
                "success": True,
                "message": "You have declined this reinvestment.",
                "action": "rejected"
            }
            
    except Exception as e:
        logger.error(f"Error in reinvestment approval link: {e}")
        return {"success": False, "message": "Invalid or expired approval link"}


# Kinntegra MF Buy Scheduler API Configuration
KINNTEGRA_API_BASE_URL = "https://api.kinntegra.co.in/api/transaction"
KINNTEGRA_API_KEY = "397071386F563639685674495956545432704E4F6E673D3D"


async def call_kinntegra_mf_buy_scheduler(cashflow: dict, client: dict, is_revision: bool = False) -> dict:
    """
    Call Kinntegra MF Buy Scheduler API when client approves reinvestment tag.
    
    Args:
        cashflow: The holding_cashflows document with reinvestment tag
        client: The client document
        is_revision: If True, calls revisebuyschedule endpoint instead of addbuyschedule
    
    Returns:
        dict with API response or error details
    """
    import httpx
    
    try:
        # Determine the investment amount based on reinvestment tag
        tag = cashflow.get('reinvestment_tag', 'not_tagged')
        if tag == 'other':
            amount = cashflow.get('custom_amount', 0)
        elif tag == 'principal':
            amount = cashflow.get('principal_component', 0)
        elif tag == 'interest':
            amount = cashflow.get('interest_component', 0) - cashflow.get('tds_amount', 0)
        elif tag == 'net_amount':
            amount = cashflow.get('net_amount', 0)
        else:
            return {"status": "skipped", "message": f"Invalid reinvestment tag: {tag}"}
        
        if amount <= 0:
            return {"status": "skipped", "message": "Investment amount is zero or negative"}
        
        # Get bond details for DealId
        bond = await db.bonds.find_one({"id": cashflow.get('bond_id')}, {"_id": 0})
        deal_id = bond.get('bond_code', '') if bond else cashflow.get('bond_id', '')
        
        # Get UCC from client (Unique Client Code for MF)
        ucc = client.get('ucc', client.get('pan_number', ''))
        
        # Prepare investment data
        investment_item = {
            "UCC": ucc,
            "DealId": deal_id,
            "BondInvestmentDate": cashflow.get('date', datetime.now(timezone.utc).strftime('%Y-%m-%d')),
            "InvestmentAmount": amount,
            "PortfolioName": cashflow.get('portfolio_category', 'wealth'),
            "MFInvestmentDate": datetime.now(timezone.utc).strftime('%Y-%m-%d')
        }
        
        # Add revision fields if this is a revision
        if is_revision:
            investment_item["RevisedAmount"] = amount
            investment_item["RevisedDate"] = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        api_payload = {"InvestmentData": [investment_item]}
        
        # Determine endpoint
        endpoint = f"{KINNTEGRA_API_BASE_URL}/{'revisebuyschedule' if is_revision else 'addbuyschedule'}"
        
        headers = {
            "Content-Type": "application/json",
            "x-api-key": KINNTEGRA_API_KEY
        }
        
        # Log the API request
        api_log = {
            "id": str(uuid.uuid4()),
            "cashflow_id": cashflow.get('id'),
            "client_id": client.get('id'),
            "client_name": client.get('name'),
            "endpoint": endpoint,
            "payload": api_payload,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.kinntegra_api_logs.insert_one(api_log)
        
        # Make the API call
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(endpoint, json=api_payload, headers=headers)
            
            response_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {"raw": response.text}
            
            # Update log with response
            await db.kinntegra_api_logs.update_one(
                {"id": api_log['id']},
                {"$set": {
                    "status": "success" if response.status_code == 200 else "error",
                    "response_status_code": response.status_code,
                    "response_body": response_data,
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Update cashflow with API submission status
            await db.holding_cashflows.update_one(
                {"id": cashflow.get('id')},
                {"$set": {
                    "kinntegra_api_submitted": True,
                    "kinntegra_api_status": "success" if response.status_code == 200 else "error",
                    "kinntegra_api_response": response_data,
                    "kinntegra_submitted_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully submitted to Kinntegra API for cashflow {cashflow.get('id')}")
                return {
                    "status": "success",
                    "message": "Successfully submitted to Kinntegra MF Buy Scheduler",
                    "api_response": response_data
                }
            else:
                logger.error(f"Kinntegra API error: {response.status_code} - {response_data}")
                return {
                    "status": "error",
                    "message": f"API returned status {response.status_code}",
                    "api_response": response_data
                }
                
    except httpx.TimeoutException:
        logger.error("Kinntegra API timeout")
        return {"status": "error", "message": "API request timed out"}
    except Exception as e:
        logger.error(f"Error calling Kinntegra API: {e}")
        return {"status": "error", "message": str(e)}


async def submit_to_kinntegra_internal(submission_id: str) -> dict:
    """Internal function to submit approved reinvestment to Kinntegra API"""
    try:
        submission = await db.reinvestment_submissions.find_one({"id": submission_id}, {"_id": 0})
        if not submission:
            return {"status": "error", "message": "Submission not found"}
        
        # Get cashflows
        cashflows = await db.holding_cashflows.find(
            {"id": {"$in": submission['cashflow_ids']}}
        ).to_list(100)
        
        # Get client
        client = await db.clients.find_one({"id": submission['client_id']}, {"_id": 0})
        
        # Prepare Kinntegra API payload
        investment_data = []
        for cf in cashflows:
            investment_data.append({
                "UCC": submission.get('target_ucc', client.get('ucc', '')),
                "DealId": cf.get('bond_id', ''),
                "BondInvestmentDate": cf.get('date', ''),
                "InvestmentAmount": cf.get('net_amount', 0),
                "PortfolioName": submission.get('portfolio_category', 'wealth'),
                "MFInvestmentDate": datetime.now(timezone.utc).strftime('%Y-%m-%d')
            })
        
        api_payload = {"InvestmentData": investment_data}
        
        # Store the API request (will make actual call when Kinntegra auth is available)
        kinntegra_request = {
            "id": str(uuid.uuid4()),
            "submission_id": submission_id,
            "client_id": submission['client_id'],
            "api_endpoint": "https://api.kinntegra.co.in/api/transaction/addbuyschedule",
            "payload": api_payload,
            "status": "pending_api_credentials",  # Change to 'submitted' when we have API credentials
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.kinntegra_api_requests.insert_one(kinntegra_request)
        
        # Update submission status
        await db.reinvestment_submissions.update_one(
            {"id": submission_id},
            {
                "$set": {
                    "kinntegra_status": "pending_api_credentials",
                    "kinntegra_request_id": kinntegra_request['id'],
                    "kinntegra_payload": api_payload
                }
            }
        )
        
        # Create log entry
        await create_approval_log(
            entity_type="reinvestment",
            entity_id=submission_id,
            action="kinntegra_prepared",
            actor_id="system",
            actor_role="system",
            actor_name="System",
            details={
                "kinntegra_request_id": kinntegra_request['id'],
                "status": "pending_api_credentials"
            },
            notes="Kinntegra API payload prepared. Awaiting API credentials for submission."
        )
        
        logger.info(f"Kinntegra submission prepared for submission {submission_id}")
        return {"status": "pending_api_credentials", "request_id": kinntegra_request['id']}
        
    except Exception as e:
        logger.error(f"Error preparing Kinntegra submission: {e}")
        return {"status": "error", "message": str(e)}


@api_router.get("/approval-workflow/my-submissions")
async def get_my_submissions(current_user: dict = Depends(get_current_user)):
    """Sub-broker gets their own submissions status"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can view their submissions")
    
    submissions = await db.reinvestment_submissions.find(
        {"sub_broker_id": current_user['id']},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with client info
    for sub in submissions:
        client = await db.clients.find_one(
            {"id": sub['client_id']},
            {"_id": 0, "name": 1}
        )
        sub['client_name'] = client.get('name') if client else 'Unknown'
    
    return submissions


# ==================== SUB-BROKER REINVESTMENT ====================

@api_router.get("/sub-broker/reinvestment/upcoming")
async def get_subbroker_upcoming_reinvestments(current_user: dict = Depends(get_current_user)):
    """Get upcoming cashflows for sub-broker's linked clients only"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can access this endpoint")
    
    # Get linked client IDs
    linked_clients = await db.clients.find(
        {"linked_subbroker_id": current_user['id']},
        {"id": 1, "name": 1, "pan": 1, "ucc_list": 1, "_id": 0}
    ).to_list(1000)
    
    client_ids = [c['id'] for c in linked_clients]
    client_map = {c['id']: c for c in linked_clients}
    
    if not client_ids:
        return {"by_client": [], "summary": {"total_amount": 0, "total_entries": 0}}
    
    # Get bonds
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    bond_map = {b['id']: b for b in bonds}
    
    # Get all clients with bond allocations
    all_clients = await db.clients.find(
        {"id": {"$in": client_ids}},
        {"_id": 0}
    ).to_list(1000)
    
    by_client = []
    total_amount = 0
    total_entries = 0
    
    for client in all_clients:
        client_entries = []
        allocations = client.get('bond_allocations', [])
        
        for alloc in allocations:
            bond = bond_map.get(alloc.get('bond_id'))
            if not bond:
                continue
            
            cashflows = alloc.get('cashflows', [])
            for cf in cashflows:
                cf_date = cf.get('date', '')
                if not cf_date:
                    continue
                
                # Only include future cashflows
                try:
                    cf_date_obj = datetime.fromisoformat(cf_date.replace('Z', '+00:00'))
                    if cf_date_obj.date() < datetime.now(timezone.utc).date():
                        continue
                except:
                    continue
                
                amount = cf.get('interest_component', cf.get('amount', 0))
                total_amount += amount
                total_entries += 1
                
                client_entries.append({
                    "cashflow_id": cf.get('id', f"{alloc.get('bond_id')}_{cf_date}"),
                    "opportunity_name": bond.get('issuer', 'Bond'),
                    "expected_date": cf_date,
                    "cashflow_type": cf.get('type', 'interest'),
                    "amount": amount,
                    "reinvestment_tag": cf.get('reinvestment_tag', 'not_tagged'),
                    "portfolio_category": cf.get('portfolio_category', ''),
                    "target_ucc": cf.get('target_ucc', ''),
                    "approval_status": cf.get('approval_status', 'not_submitted')
                })
        
        if client_entries:
            client_info = client_map.get(client['id'], {})
            by_client.append({
                "client_id": client['id'],
                "client_name": client.get('name', ''),
                "client_pan": client.get('pan', ''),
                "ucc_list": client.get('ucc_list', []),
                "entries": client_entries
            })
    
    return {
        "by_client": by_client,
        "summary": {
            "total_amount": total_amount,
            "total_entries": total_entries
        }
    }


# ==================== BULK UPLOAD ENDPOINTS ====================

@api_router.get("/bulk/template/sub-brokers")
async def download_subbroker_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk sub-broker upload"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Sub Brokers"
    
    # Headers
    headers = ["Name*", "PAN*", "Partner Code*", "Email*", "Mobile*", "Password*", "PIN*", 
               "Address Line 1", "Address Line 2", "City", "State", "Country", "Pincode"]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")
        ws.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample row
    sample = ["John Doe", "ABCDE1234F", "SB001", "john@example.com", "9876543210", 
              "password123", "1234", "123 Main St", "Suite 100", "Mumbai", "Maharashtra", "India", "400001"]
    for col, value in enumerate(sample, 1):
        ws.cell(row=2, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK SUB-BROKER UPLOAD INSTRUCTIONS",
        "",
        "Required Fields (marked with *):",
        "- Name: Full name of the sub-broker",
        "- PAN: Valid PAN number (10 characters, e.g., ABCDE1234F)",
        "- Partner Code: Unique code for the sub-broker (e.g., SB001)",
        "- Email: Valid email address",
        "- Mobile: 10-digit mobile number",
        "- Password: Login password (min 6 characters)",
        "- PIN: 4-digit PIN for transactions",
        "",
        "Optional Fields:",
        "- Address details for complete profile",
        "",
        "Notes:",
        "- Delete the sample row before uploading",
        "- PAN and Partner Code must be unique",
        "- Maximum 100 records per upload"
    ]
    for row, text in enumerate(instructions, 1):
        ws_instructions.cell(row=row, column=1, value=text)
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sub_broker_template.xlsx"}
    )


@api_router.post("/bulk/sub-brokers")
async def bulk_upload_subbrokers(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload sub-brokers from Excel file"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload sub-brokers")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    df = pd.read_excel(io.BytesIO(content), sheet_name=0)
    
    # Clean column names
    df.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df.columns]
    
    results = {"success": 0, "failed": 0, "errors": [], "created_subbrokers": []}
    
    for idx, row in df.iterrows():
        try:
            # Validate required fields
            if pd.isna(row.get('name')) or pd.isna(row.get('pan')) or pd.isna(row.get('partner_code')):
                results['errors'].append(f"Row {idx+2}: Missing required fields (Name, PAN, or Partner Code)")
                results['failed'] += 1
                continue
            
            pan = str(row['pan']).upper().strip()
            partner_code = str(row['partner_code']).strip()
            name = str(row['name']).strip()
            email = str(row.get('email', '')).strip() if not pd.isna(row.get('email')) else ''
            
            # Check for duplicates
            existing_pan = await db.users.find_one({"pan": pan})
            if existing_pan:
                results['errors'].append(f"Row {idx+2}: PAN {pan} already exists")
                results['failed'] += 1
                continue
            
            existing_code = await db.partners.find_one({"partner_code": partner_code})
            if existing_code:
                results['errors'].append(f"Row {idx+2}: Partner code {partner_code} already exists")
                results['failed'] += 1
                continue
            
            # Generate password and PIN
            password = str(row.get('password', '')).strip() if not pd.isna(row.get('password')) else generate_password()
            pin = str(row.get('pin', '')).strip() if not pd.isna(row.get('pin')) else generate_pin()
            
            # Create user
            user_id = str(uuid.uuid4())
            user = {
                "id": user_id,
                "pan": pan,
                "name": name,
                "email": email,
                "phone": str(row.get('mobile', '')).strip() if not pd.isna(row.get('mobile')) else '',
                "password_hash": get_password_hash(password),
                "pin_hash": get_password_hash(pin),
                "role": "sub_broker",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user)
            
            # Create partner record
            partner = {
                "id": user_id,
                "name": name,
                "pan": pan,
                "partner_code": partner_code,
                "email": email,
                "mobile": str(row.get('mobile', '')).strip() if not pd.isna(row.get('mobile')) else '',
                "color": "#C9A227",  # Etihad gold
                "address_line1": str(row.get('address_line_1', '')).strip() if not pd.isna(row.get('address_line_1')) else "",
                "address_line2": str(row.get('address_line_2', '')).strip() if not pd.isna(row.get('address_line_2')) else "",
                "city": str(row.get('city', '')).strip() if not pd.isna(row.get('city')) else "",
                "state": str(row.get('state', '')).strip() if not pd.isna(row.get('state')) else "",
                "country": str(row.get('country', 'India')).strip() if not pd.isna(row.get('country')) else "India",
                "pincode": str(row.get('pincode', '')).strip() if not pd.isna(row.get('pincode')) else "",
                "created_by": current_user['id'],
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                # Store plain credentials for display to broker and resend capability
                "initial_password": password,
                "initial_pin": pin
            }
            await db.partners.insert_one(partner)
            
            results['success'] += 1
            results['created_subbrokers'].append({
                "name": name,
                "pan": pan,
                "partner_code": partner_code,
                "email": email
            })
            
            # Send welcome email to sub-broker (if email provided)
            if email and background_tasks:
                background_tasks.add_task(
                    send_welcome_email_subbroker,
                    subbroker_name=name,
                    subbroker_email=email,
                    pan=pan,
                    password=password,
                    pin=pin,
                    partner_code=partner_code,
                    broker_name=current_user.get('name', 'Admin')
                )
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.get("/bulk/template/clients")
async def download_client_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk client upload with all fields"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Personal Details
    ws_personal = wb.active
    ws_personal.title = "Personal Details"
    
    personal_headers = ["Name*", "PAN*", "UCC1*", "UCC2", "UCC3", "UCC4", "UCC5", "Email*", "Mobile*", "Password*", "PIN*", 
                       "Date of Birth", "Occupation", "Father/Husband Name", "Demat Account No"]
    for col, header in enumerate(personal_headers, 1):
        cell = ws_personal.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_personal.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample row
    personal_sample = ["Jane Smith", "PQRST5678U", "UCC123456", "UCC123457", "", "", "", "jane@example.com", "9876543213", 
                      "password123", "1234", "1990-05-15", "Business", "John Smith", "1234567890123456"]
    for col, value in enumerate(personal_sample, 1):
        ws_personal.cell(row=2, column=col, value=value)
    
    # Sheet 2: Address Details
    ws_address = wb.create_sheet("Address Details")
    
    address_headers = ["PAN*", "Address Line 1", "Address Line 2", "City", "State", "Country", "Pincode"]
    for col, header in enumerate(address_headers, 1):
        cell = ws_address.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_address.column_dimensions[get_column_letter(col)].width = 18
    
    address_sample = ["PQRST5678U", "456 Park Avenue", "Apartment 10B", "Mumbai", "Maharashtra", "India", "400001"]
    for col, value in enumerate(address_sample, 1):
        ws_address.cell(row=2, column=col, value=value)
    
    # Sheet 3: Bank Details
    ws_bank = wb.create_sheet("Bank Details")
    
    bank_headers = ["PAN*", "Bank Name", "Account Number", "Branch", "IFSC Code"]
    for col, header in enumerate(bank_headers, 1):
        cell = ws_bank.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_bank.column_dimensions[get_column_letter(col)].width = 20
    
    bank_sample = ["PQRST5678U", "HDFC Bank", "12345678901234", "Andheri West", "HDFC0001234"]
    for col, value in enumerate(bank_sample, 1):
        ws_bank.cell(row=2, column=col, value=value)
    
    # Sheet 4: Nominee Details
    ws_nominee = wb.create_sheet("Nominee Details")
    
    nominee_headers = ["PAN*", "Nominee Name", "Nominee DOB", "Nominee Mobile", "Relationship"]
    for col, header in enumerate(nominee_headers, 1):
        cell = ws_nominee.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_nominee.column_dimensions[get_column_letter(col)].width = 18
    
    nominee_sample = ["PQRST5678U", "John Smith", "1965-03-20", "9876543210", "Father"]
    for col, value in enumerate(nominee_sample, 1):
        ws_nominee.cell(row=2, column=col, value=value)
    
    # Sheet 5: Sub-Broker Assignment
    ws_subbroker = wb.create_sheet("Sub-Broker Assignment")
    
    sb_headers = ["PAN*", "Sub-Broker Code"]
    for col, header in enumerate(sb_headers, 1):
        cell = ws_subbroker.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_subbroker.column_dimensions[get_column_letter(col)].width = 20
    
    sb_sample = ["PQRST5678U", "SB001"]
    for col, value in enumerate(sb_sample, 1):
        ws_subbroker.cell(row=2, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK CLIENT UPLOAD INSTRUCTIONS",
        "",
        "This template has 5 data sheets. Fill Personal Details (required) and optionally fill other sheets.",
        "PAN number is used to link data across sheets.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Personal Details (Purple) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Name*: Full legal name",
        "• PAN*: Valid 10-character PAN (e.g., PQRST5678U)",
        "• Email*: Valid email address",
        "• Mobile*: 10-digit mobile number",
        "• Password*: Login password (min 6 characters)",
        "• PIN*: 4-digit transaction PIN",
        "• Date of Birth: Format YYYY-MM-DD",
        "• Occupation: Client's occupation/profession",
        "• Father/Husband Name: As per PAN card",
        "• Demat Account No: 16-digit demat account",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Address Details (Green) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Complete residential address of the client",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 3 - Bank Details (Orange) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Bank account details for payments and withdrawals",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 4 - Nominee Details (Red) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Nominee information for the client's investments",
        "• Relationship: Father, Mother, Spouse, Son, Daughter, etc.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 5 - Sub-Broker Assignment (Indigo) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Assign clients to sub-brokers using their partner code",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. PAN must be unique and match across all sheets",
        "2. Delete sample rows before uploading",
        "3. Maximum 200 clients per upload",
        "4. Dates should be in YYYY-MM-DD format",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("BULK") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 70
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=client_upload_template.xlsx"}
    )


@api_router.get("/bulk/template/clients-indian")
async def download_indian_client_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk Indian passport holder client upload"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Personal Details
    ws_personal = wb.active
    ws_personal.title = "Personal Details"
    
    personal_headers = ["Name*", "PAN*", "Email*", "Mobile*", "Country of Residency*",
                       "Opportunities* (bonds,real_estate)", "Date of Birth", "Occupation", "Father/Husband Name"]
    for col, header in enumerate(personal_headers, 1):
        cell = ws_personal.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_personal.column_dimensions[get_column_letter(col)].width = 22
    
    personal_sample = ["Rahul Sharma", "ABCDE1234F", "rahul@example.com", "9876543210", "India",
                      "bonds,real_estate", "1990-05-15", "Business", "Suresh Sharma"]
    for col, value in enumerate(personal_sample, 1):
        ws_personal.cell(row=2, column=col, value=value)
    
    # Sheet 2: Bank & Investment Details (Required for Bonds)
    ws_bank = wb.create_sheet("Bank & Investment Details")
    
    # Indian bank details + Account Type (for Indian residents: Savings/Current, for NRIs: NRE/NRO/Savings/Current)
    bank_headers = ["PAN*", "Bank Name*", "Account Number*", "Account Type*", "Branch", "IFSC Code*",
                   "Demat Account No", "UCC1", "UCC2", "UCC3", "UCC4", "UCC5"]
    for col, header in enumerate(bank_headers, 1):
        cell = ws_bank.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_bank.column_dimensions[get_column_letter(col)].width = 18
    
    bank_sample = ["ABCDE1234F", "HDFC Bank", "12345678901234", "Savings", "Andheri West", "HDFC0001234",
                  "1234567890123456", "UCC123456", "", "", "", ""]
    for col, value in enumerate(bank_sample, 1):
        ws_bank.cell(row=2, column=col, value=value)
    
    # Add note about Account Type options
    ws_bank.cell(row=4, column=1, value="Account Type Options:")
    ws_bank.cell(row=5, column=1, value="For Indian Residents: Savings, Current")
    ws_bank.cell(row=6, column=1, value="For NRIs (Non-India Residency): NRE, NRO, Savings, Current")
    
    # Sheet 2b: International Bank Details (Required for NRIs - Non-India Residency)
    ws_intl_bank = wb.create_sheet("International Bank (NRI)")
    
    intl_bank_headers = ["PAN*", "Intl Bank Name*", "Intl Account Number*", "IBAN*", "SWIFT Code*"]
    for col, header in enumerate(intl_bank_headers, 1):
        cell = ws_intl_bank.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_intl_bank.column_dimensions[get_column_letter(col)].width = 22
    
    intl_bank_sample = ["ABCDE1234F", "Commercial Bank of Dubai", "1007997925", "AE690230000001007997925", "CBDUAEAD"]
    for col, value in enumerate(intl_bank_sample, 1):
        ws_intl_bank.cell(row=2, column=col, value=value)
    
    # Add note
    ws_intl_bank.cell(row=4, column=1, value="Note: This sheet is REQUIRED only for NRIs (Indian Passport + Non-India Residency)")
    ws_intl_bank.cell(row=5, column=1, value="Skip this sheet for Indian Residents")
    
    # Sheet 3: Passport Details (Required for Real Estate)
    ws_passport = wb.create_sheet("Passport Details")
    
    passport_headers = ["PAN*", "Passport Number", "Passport Valid From*", "Passport Valid Until*", "Passport Country of Issue*"]
    for col, header in enumerate(passport_headers, 1):
        cell = ws_passport.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0891B2", end_color="0891B2", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_passport.column_dimensions[get_column_letter(col)].width = 22
    
    passport_sample = ["ABCDE1234F", "A1234567", "2020-01-15", "2030-01-14", "India"]
    for col, value in enumerate(passport_sample, 1):
        ws_passport.cell(row=2, column=col, value=value)
    
    # Sheet 4: Address Details
    ws_address = wb.create_sheet("Address Details")
    
    address_headers = ["PAN*", "Address Line 1", "Address Line 2", "City", "State", "Country", "Pincode"]
    for col, header in enumerate(address_headers, 1):
        cell = ws_address.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_address.column_dimensions[get_column_letter(col)].width = 18
    
    address_sample = ["ABCDE1234F", "456 Park Avenue", "Apartment 10B", "Mumbai", "Maharashtra", "India", "400001"]
    for col, value in enumerate(address_sample, 1):
        ws_address.cell(row=2, column=col, value=value)
    
    # Sheet 5: Nominee Details
    ws_nominee = wb.create_sheet("Nominee Details")
    
    nominee_headers = ["PAN*", "Nominee Name", "Nominee DOB", "Nominee Mobile", "Relationship"]
    for col, header in enumerate(nominee_headers, 1):
        cell = ws_nominee.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_nominee.column_dimensions[get_column_letter(col)].width = 18
    
    nominee_sample = ["ABCDE1234F", "Priya Sharma", "1965-03-20", "9876543210", "Mother"]
    for col, value in enumerate(nominee_sample, 1):
        ws_nominee.cell(row=2, column=col, value=value)
    
    # Sheet 6: Sub-Broker Assignment
    ws_subbroker = wb.create_sheet("Sub-Broker Assignment")
    
    sb_headers = ["PAN*", "Sub-Broker Code"]
    for col, header in enumerate(sb_headers, 1):
        cell = ws_subbroker.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_subbroker.column_dimensions[get_column_letter(col)].width = 20
    
    sb_sample = ["ABCDE1234F", "SB001"]
    for col, value in enumerate(sb_sample, 1):
        ws_subbroker.cell(row=2, column=col, value=value)
    
    # Sheet 7: Country of Residency List
    ws_countries = wb.create_sheet("Country List")
    
    countries_list = [
        "India", "UAE", "USA", "UK", "Singapore", "Australia", "Canada", "Germany",
        "France", "Netherlands", "Switzerland", "Japan", "China", "Hong Kong", 
        "South Korea", "Malaysia", "Indonesia", "Thailand", "Philippines", "Vietnam",
        "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "New Zealand",
        "Ireland", "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Austria",
        "Italy", "Spain", "Portugal", "Greece", "Poland", "Czech Republic", "Russia",
        "South Africa", "Kenya", "Nigeria", "Egypt", "Brazil", "Mexico", "Argentina"
    ]
    
    ws_countries.cell(row=1, column=1, value="Country of Residency")
    ws_countries.cell(row=1, column=1).font = Font(bold=True, color="FFFFFF")
    ws_countries.cell(row=1, column=1).fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
    ws_countries.column_dimensions['A'].width = 25
    
    for idx, country in enumerate(countries_list, 2):
        ws_countries.cell(row=idx, column=1, value=country)
    
    # Add note
    ws_countries.cell(row=len(countries_list)+3, column=1, value="Note: Copy from this list to 'Country of Residency' column in Personal Details sheet")
    ws_countries.cell(row=len(countries_list)+4, column=1, value="If your country is not listed, type it manually")
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "INDIAN PASSPORT HOLDERS - BULK CLIENT UPLOAD",
        "",
        "This template is for Indian Passport holders who can invest in:",
        "• Bonds / NCD",
        "• Real Estate",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Personal Details (Purple) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Name*: Full legal name",
        "• PAN*: Valid 10-character PAN (e.g., ABCDE1234F) - This is the LOGIN ID",
        "• Email*: Valid email address",
        "• Mobile*: 10-digit mobile number",
        "• Country of Residency*: Current country of residence",
        "• Opportunities*: Comma-separated (bonds,real_estate or just bonds or just real_estate)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Bank & Investment Details (Orange) - REQUIRED FOR BONDS",
        "═══════════════════════════════════════════════════════════════",
        "• Bank details are mandatory if 'bonds' is selected in Opportunities",
        "• UCC fields (1-5): Up to 5 Unique Client Codes",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 3 - Passport Details (Cyan) - REQUIRED FOR REAL ESTATE",
        "═══════════════════════════════════════════════════════════════",
        "• Passport validity details mandatory if 'real_estate' is selected",
        "• System will notify 3 months before passport expiry",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. PAN is used as LOGIN ID for all Indian passport holders",
        "2. Default Password: kinntegra123",
        "3. Default PIN: 1234",
        "4. Delete sample rows before uploading",
        "5. Maximum 200 clients per upload",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("INDIAN") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 70
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=indian_client_upload_template.xlsx"}
    )


@api_router.get("/bulk/template/clients-foreign")
async def download_foreign_client_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk Foreign passport holder client upload"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Personal Details
    ws_personal = wb.active
    ws_personal.title = "Personal Details"
    
    personal_headers = ["Name*", "Passport Number*", "Email*", "Mobile*", "Country of Residency*",
                       "Emirates ID", "Emirates ID Expiry", "Opportunities* (real_estate,gift_city)", "Date of Birth", "Occupation"]
    for col, header in enumerate(personal_headers, 1):
        cell = ws_personal.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_personal.column_dimensions[get_column_letter(col)].width = 24
    
    personal_sample = ["John Smith", "A1234567", "john@example.com", "+971501234567", "United Arab Emirates",
                      "784-1234-1234567-1", "2030-12-31", "real_estate,gift_city", "1985-08-20", "Executive"]
    for col, value in enumerate(personal_sample, 1):
        ws_personal.cell(row=2, column=col, value=value)
    
    # Sheet 2: Passport Details (Required for all)
    ws_passport = wb.create_sheet("Passport Details")
    
    passport_headers = ["Passport Number*", "Passport Valid From*", "Passport Valid Until*", "Passport Country of Issue*"]
    for col, header in enumerate(passport_headers, 1):
        cell = ws_passport.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0891B2", end_color="0891B2", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_passport.column_dimensions[get_column_letter(col)].width = 24
    
    passport_sample = ["A1234567", "2020-06-15", "2030-06-14", "United States"]
    for col, value in enumerate(passport_sample, 1):
        ws_passport.cell(row=2, column=col, value=value)
    
    # Sheet 2b: International Bank Details (Required for Foreign Passport holders)
    ws_intl_bank = wb.create_sheet("International Bank Details")
    
    intl_bank_headers = ["Passport Number*", "Bank Name*", "Account Number*", "IBAN*", "SWIFT Code*"]
    for col, header in enumerate(intl_bank_headers, 1):
        cell = ws_intl_bank.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_intl_bank.column_dimensions[get_column_letter(col)].width = 26
    
    intl_bank_sample = ["A1234567", "Commercial Bank of Dubai", "1007997925", "AE690230000001007997925", "CBDUAEAD"]
    for col, value in enumerate(intl_bank_sample, 1):
        ws_intl_bank.cell(row=2, column=col, value=value)
    
    # Sheet 3: Address Details
    ws_address = wb.create_sheet("Address Details")
    
    address_headers = ["Passport Number*", "Address Line 1", "Address Line 2", "City", "State/Region", "Country", "Postal Code"]
    for col, header in enumerate(address_headers, 1):
        cell = ws_address.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_address.column_dimensions[get_column_letter(col)].width = 18
    
    address_sample = ["A1234567", "Building 5, Street 12", "Dubai Marina", "Dubai", "Dubai", "United Arab Emirates", "00000"]
    for col, value in enumerate(address_sample, 1):
        ws_address.cell(row=2, column=col, value=value)
    
    # Sheet 4: Nominee Details
    ws_nominee = wb.create_sheet("Nominee Details")
    
    nominee_headers = ["Passport Number*", "Nominee Name", "Nominee DOB", "Nominee Mobile", "Relationship"]
    for col, header in enumerate(nominee_headers, 1):
        cell = ws_nominee.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_nominee.column_dimensions[get_column_letter(col)].width = 18
    
    nominee_sample = ["A1234567", "Jane Smith", "1988-11-25", "+971509876543", "Spouse"]
    for col, value in enumerate(nominee_sample, 1):
        ws_nominee.cell(row=2, column=col, value=value)
    
    # Sheet 5: Sub-Broker Assignment
    ws_subbroker = wb.create_sheet("Sub-Broker Assignment")
    
    sb_headers = ["Passport Number*", "Sub-Broker Code"]
    for col, header in enumerate(sb_headers, 1):
        cell = ws_subbroker.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_subbroker.column_dimensions[get_column_letter(col)].width = 20
    
    sb_sample = ["A1234567", "SB001"]
    for col, value in enumerate(sb_sample, 1):
        ws_subbroker.cell(row=2, column=col, value=value)
    
    # Sheet 6: Country of Residency List
    ws_countries = wb.create_sheet("Country List")
    
    countries_list = [
        "United Arab Emirates", "USA", "UK", "Singapore", "Australia", "Canada", "Germany",
        "France", "Netherlands", "Switzerland", "Japan", "China", "Hong Kong", 
        "South Korea", "Malaysia", "Indonesia", "Thailand", "Philippines", "Vietnam",
        "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "New Zealand",
        "Ireland", "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Austria",
        "Italy", "Spain", "Portugal", "Greece", "Poland", "Czech Republic", "Russia",
        "South Africa", "Kenya", "Nigeria", "Egypt", "Brazil", "Mexico", "Argentina",
        "India"
    ]
    
    ws_countries.cell(row=1, column=1, value="Country of Residency")
    ws_countries.cell(row=1, column=1).font = Font(bold=True, color="FFFFFF")
    ws_countries.cell(row=1, column=1).fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    ws_countries.column_dimensions['A'].width = 30
    
    for idx, country in enumerate(countries_list, 2):
        ws_countries.cell(row=idx, column=1, value=country)
    
    # Add note
    ws_countries.cell(row=len(countries_list)+3, column=1, value="Note: Copy from this list to 'Country of Residency' column in Personal Details sheet")
    ws_countries.cell(row=len(countries_list)+4, column=1, value="If your country is not listed, type it manually")
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "FOREIGN PASSPORT HOLDERS - BULK CLIENT UPLOAD",
        "",
        "This template is for Foreign Passport holders who can invest in:",
        "• Real Estate (Dubai/UAE properties)",
        "• GIFT City (Gujarat International Finance Tec-City)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Personal Details (Blue) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Name*: Full legal name as per passport",
        "• Passport Number*: Valid passport number - This is the LOGIN ID",
        "• Email*: Valid email address",
        "• Mobile*: Include country code (e.g., +971501234567)",
        "• Country of Residency*: Current country of residence",
        "• Emirates ID: REQUIRED if Country of Residency is UAE",
        "• Emirates ID Expiry: Expiry date of Emirates ID (YYYY-MM-DD)",
        "• Opportunities*: Comma-separated (real_estate,gift_city or just one)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Passport Details (Cyan) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Passport validity details are mandatory for all foreign clients",
        "• System will notify 3 months before passport expiry",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. Passport Number is used as LOGIN ID for all foreign passport holders",
        "2. Emirates ID and Expiry are REQUIRED for UAE residents",
        "3. Default Password: kinntegra123",
        "4. Default PIN: 1234",
        "5. Delete sample rows before uploading",
        "6. Maximum 200 clients per upload",
        "7. Foreign passport holders CANNOT invest in Indian Bonds",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("FOREIGN") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 70
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=foreign_client_upload_template.xlsx"}
    )


@api_router.post("/bulk/clients-indian")
async def bulk_upload_indian_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload Indian passport holder clients from Excel file"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can bulk upload clients")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    excel_file = io.BytesIO(content)
    
    # Read all sheets
    try:
        df_personal = pd.read_excel(excel_file, sheet_name=0)  # Personal Details
        excel_file.seek(0)
        df_bank = pd.read_excel(excel_file, sheet_name=1)       # Bank & Investment Details
        excel_file.seek(0)
        df_intl_bank = pd.read_excel(excel_file, sheet_name=2)  # International Bank (NRI)
        excel_file.seek(0)
        df_passport = pd.read_excel(excel_file, sheet_name=3)   # Passport Details
        excel_file.seek(0)
        df_address = pd.read_excel(excel_file, sheet_name=4)    # Address Details
        excel_file.seek(0)
        df_nominee = pd.read_excel(excel_file, sheet_name=5)    # Nominee Details
        excel_file.seek(0)
        df_subbroker = pd.read_excel(excel_file, sheet_name=6)  # Sub-Broker Assignment
    except Exception as e:
        excel_file.seek(0)
        df_personal = pd.read_excel(excel_file, sheet_name=0)
        df_bank = pd.DataFrame()
        df_intl_bank = pd.DataFrame()
        df_passport = pd.DataFrame()
        df_address = pd.DataFrame()
        df_nominee = pd.DataFrame()
        df_subbroker = pd.DataFrame()
    
    # Clean column names
    def clean_columns(df):
        if not df.empty:
            df.columns = [col.replace('*', '').strip().lower().replace(' ', '_').replace('-', '_').replace('/', '_') for col in df.columns]
        return df
    
    df_personal = clean_columns(df_personal)
    df_bank = clean_columns(df_bank)
    df_passport = clean_columns(df_passport)
    df_intl_bank = clean_columns(df_intl_bank)
    df_address = clean_columns(df_address)
    df_nominee = clean_columns(df_nominee)
    df_subbroker = clean_columns(df_subbroker)
    
    # Create lookup dictionaries by PAN
    bank_by_pan = {}
    intl_bank_by_pan = {}
    passport_by_pan = {}
    address_by_pan = {}
    nominee_by_pan = {}
    subbroker_by_pan = {}
    
    if not df_bank.empty and 'pan' in df_bank.columns:
        for _, row in df_bank.iterrows():
            if not pd.isna(row.get('pan')):
                bank_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_intl_bank.empty and 'pan' in df_intl_bank.columns:
        for _, row in df_intl_bank.iterrows():
            if not pd.isna(row.get('pan')):
                intl_bank_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_passport.empty and 'pan' in df_passport.columns:
        for _, row in df_passport.iterrows():
            if not pd.isna(row.get('pan')):
                passport_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_address.empty and 'pan' in df_address.columns:
        for _, row in df_address.iterrows():
            if not pd.isna(row.get('pan')):
                address_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_nominee.empty and 'pan' in df_nominee.columns:
        for _, row in df_nominee.iterrows():
            if not pd.isna(row.get('pan')):
                nominee_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_subbroker.empty and 'pan' in df_subbroker.columns:
        for _, row in df_subbroker.iterrows():
            if not pd.isna(row.get('pan')):
                subbroker_by_pan[str(row['pan']).upper().strip()] = row
    
    results = {"success": 0, "failed": 0, "errors": [], "created_clients": []}
    
    def get_val(data, key, default=''):
        if isinstance(data, pd.Series):
            val = data.get(key)
            if pd.isna(val):
                return default
            return str(val).strip()
        return default
    
    for idx, row in df_personal.iterrows():
        try:
            # Validate required fields
            name = get_val(row, 'name')
            pan = get_val(row, 'pan').upper()
            email = get_val(row, 'email')
            mobile = get_val(row, 'mobile')
            country_of_residency = get_val(row, 'country_of_residency') or 'India'
            opportunities_str = get_val(row, 'opportunities_(bonds,real_estate)') or get_val(row, 'opportunities')
            
            if not name or not pan:
                results['errors'].append(f"Row {idx+2}: Missing required fields (Name or PAN)")
                results['failed'] += 1
                continue
            
            # Check if client exists
            existing = await db.clients.find_one({"$or": [{"pan_number": pan}, {"photo_id": pan}]})
            if existing:
                results['errors'].append(f"Row {idx+2}: Client with PAN {pan} already exists")
                results['failed'] += 1
                continue
            
            # ROLE OVERLAP HANDLING: Check if PAN exists as sub-broker
            existing_user = await db.users.find_one({"pan": pan})
            original_pan = pan
            is_role_overlap = False
            login_id = pan
            
            if existing_user:
                if existing_user.get('role') in ['sub_broker', 'broker']:
                    # Create client login with PAN + "1" suffix for role overlap
                    login_id = f"{pan}1"
                    is_role_overlap = True
                    
                    # Verify the modified login_id doesn't exist
                    existing_modified = await db.users.find_one({"pan": login_id})
                    if existing_modified:
                        results['errors'].append(f"Row {idx+2}: Client login for {existing_user.get('role')} PAN {pan} already exists (Login: {login_id})")
                        results['failed'] += 1
                        continue
                else:
                    results['errors'].append(f"Row {idx+2}: User with PAN {pan} already exists")
                    results['failed'] += 1
                    continue
            
            # Parse opportunities
            opportunities = []
            if opportunities_str:
                opportunities = [o.strip().lower() for o in opportunities_str.split(',')]
                for opp in opportunities:
                    if opp not in ['bonds', 'real_estate']:
                        results['errors'].append(f"Row {idx+2}: Invalid opportunity '{opp}'. Indian passport holders can only select: bonds, real_estate")
                        results['failed'] += 1
                        continue
            
            # Get bank details (required for bonds)
            bank_row = bank_by_pan.get(pan, {})
            intl_bank_row = intl_bank_by_pan.get(pan, {})
            is_nri = country_of_residency.lower() != 'india'
            
            if 'bonds' in opportunities:
                bank_name = get_val(bank_row, 'bank_name')
                account_number = get_val(bank_row, 'account_number')
                ifsc_code = get_val(bank_row, 'ifsc_code')
                account_type = get_val(bank_row, 'account_type')
                
                if not bank_name or not account_number or not ifsc_code or not account_type:
                    results['errors'].append(f"Row {idx+2}: Indian bank details (Bank Name, Account Number, IFSC, Account Type) required for Bond investments (PAN: {pan})")
                    results['failed'] += 1
                    continue
                
                # NRIs also need international bank details
                if is_nri:
                    intl_bank_name = get_val(intl_bank_row, 'intl_bank_name')
                    intl_account_number = get_val(intl_bank_row, 'intl_account_number')
                    intl_iban = get_val(intl_bank_row, 'iban')
                    intl_swift_code = get_val(intl_bank_row, 'swift_code')
                    
                    if not intl_bank_name or not intl_account_number or not intl_iban or not intl_swift_code:
                        results['errors'].append(f"Row {idx+2}: International bank details (Bank Name, Account Number, IBAN, SWIFT) required for NRIs (PAN: {pan})")
                        results['failed'] += 1
                        continue
            
            # Get passport details (required for real_estate)
            passport_row = passport_by_pan.get(pan, {})
            if 'real_estate' in opportunities:
                passport_valid_from = get_val(passport_row, 'passport_valid_from')
                passport_valid_until = get_val(passport_row, 'passport_valid_until')
                passport_country_of_issue = get_val(passport_row, 'passport_country_of_issue')
                if not passport_valid_from or not passport_valid_until or not passport_country_of_issue:
                    results['errors'].append(f"Row {idx+2}: Passport details required for Real Estate investments (PAN: {pan})")
                    results['failed'] += 1
                    continue
            
            # Collect UCCs
            ucc_list = []
            for i in range(1, 6):
                ucc_val = get_val(bank_row, f'ucc{i}')
                if ucc_val:
                    ucc_list.append(ucc_val.upper())
            
            # Get other data
            address_row = address_by_pan.get(pan, {})
            nominee_row = nominee_by_pan.get(pan, {})
            subbroker_row = subbroker_by_pan.get(pan, {})
            
            # Find linked sub-broker
            linked_subbroker_id = None
            sub_broker_code = get_val(subbroker_row, 'sub_broker_code')
            if sub_broker_code:
                sub_broker = await db.partners.find_one({"partner_code": sub_broker_code})
                if sub_broker:
                    linked_subbroker_id = sub_broker['id']
            
            if current_user['role'] == 'sub_broker' and not linked_subbroker_id:
                linked_subbroker_id = current_user['id']
            
            # Create client
            client_id = str(uuid.uuid4())
            user_id = str(uuid.uuid4())
            
            client_dict = {
                "id": client_id,
                "name": name,
                "photo_id": login_id,  # Use login_id (PAN or PAN+1 for role overlap)
                "pan_number": pan,  # Original PAN stored separately
                "pan": pan,  # Also store as 'pan' for consistency
                "original_pan": original_pan,  # Store original for reference
                "is_role_overlap": is_role_overlap,  # Track if sub-broker is also client
                "passport_type": "indian",
                "country_of_residency": country_of_residency,
                "opportunities": opportunities,
                "email": email or "",
                "mobile": mobile or "",
                "passport_number": get_val(passport_row, 'passport_number'),
                "passport_valid_from": get_val(passport_row, 'passport_valid_from'),
                "passport_valid_until": get_val(passport_row, 'passport_valid_until'),
                "passport_country_of_issue": get_val(passport_row, 'passport_country_of_issue'),
                "bank_name": get_val(bank_row, 'bank_name'),
                "account_number": get_val(bank_row, 'account_number'),
                "branch": get_val(bank_row, 'branch'),
                "ifsc_code": get_val(bank_row, 'ifsc_code'),
                "account_type": get_val(bank_row, 'account_type'),
                "intl_bank_name": get_val(intl_bank_row, 'intl_bank_name') if is_nri else "",
                "intl_account_number": get_val(intl_bank_row, 'intl_account_number') if is_nri else "",
                "intl_iban": get_val(intl_bank_row, 'iban') if is_nri else "",
                "intl_swift_code": get_val(intl_bank_row, 'swift_code') if is_nri else "",
                "demat_account_no": get_val(bank_row, 'demat_account_no'),
                "ucc_list": ucc_list,
                "occupation": get_val(row, 'occupation'),
                "date_of_birth": get_val(row, 'date_of_birth'),
                "father_husband_name": get_val(row, 'father_husband_name'),
                "address_line1": get_val(address_row, 'address_line_1'),
                "address_line2": get_val(address_row, 'address_line_2'),
                "city": get_val(address_row, 'city'),
                "state": get_val(address_row, 'state'),
                "country": get_val(address_row, 'country') or 'India',
                "pincode": get_val(address_row, 'pincode'),
                "nominee_name": get_val(nominee_row, 'nominee_name'),
                "nominee_dob": get_val(nominee_row, 'nominee_dob'),
                "nominee_mobile": get_val(nominee_row, 'nominee_mobile'),
                "nominee_relationship": get_val(nominee_row, 'relationship'),
                "linked_subbroker_id": linked_subbroker_id,
                "created_by": current_user['id'],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "bond_allocations": [],
                "verification_status": "pending",
                "is_active": True,
                "user_id": user_id,
                # Store plain credentials for broker display and email resend
                "default_password": "kinntegra123",
                "default_pin": "1234"
            }
            
            # Create user account
            user_data = {
                "id": user_id,
                "pan": login_id,  # Use login_id (PAN or PAN+1 for role overlap)
                "name": name,
                "email": email,
                "phone": mobile,
                "password_hash": get_password_hash("kinntegra123"),
                "pin_hash": get_password_hash("1234"),
                "role": "client",
                "is_active": True,
                "client_id": client_id,
                "broker_id": current_user['id'],
                "passport_type": "indian",
                "is_role_overlap": is_role_overlap,
                "original_pan": original_pan,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.users.insert_one(user_data)
            await db.clients.insert_one(client_dict)
            
            # Send welcome email with credentials (if email is provided)
            if email:
                try:
                    send_welcome_email_client(
                        client_name=name,
                        client_email=email,
                        pan=login_id,  # Use login_id (PAN or PAN+1 for role overlap)
                        password="kinntegra123",
                        pin="1234",
                        broker_name=current_user.get('name', 'Your Broker')
                    )
                except Exception as email_error:
                    logger.warning(f"Failed to send welcome email to {email}: {email_error}")
            
            # Include login_id in success message if role overlap
            success_info = {"name": name, "pan": pan, "email_sent": bool(email)}
            if is_role_overlap:
                success_info["client_login_id"] = login_id
                success_info["note"] = "Sub-broker is also a client - uses PAN+1 for client login"
            results['success'] += 1
            results['created_clients'].append(success_info)
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: Error - {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.post("/bulk/clients-foreign")
async def bulk_upload_foreign_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload Foreign passport holder clients from Excel file"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can bulk upload clients")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    excel_file = io.BytesIO(content)
    
    # Read all sheets
    try:
        df_personal = pd.read_excel(excel_file, sheet_name=0)  # Personal Details
        excel_file.seek(0)
        df_passport = pd.read_excel(excel_file, sheet_name=1)   # Passport Details
        excel_file.seek(0)
        df_passport = pd.read_excel(excel_file, sheet_name=1)   # Passport Details
        excel_file.seek(0)
        df_intl_bank = pd.read_excel(excel_file, sheet_name=2)  # International Bank Details
        excel_file.seek(0)
        df_address = pd.read_excel(excel_file, sheet_name=3)    # Address Details
        excel_file.seek(0)
        df_nominee = pd.read_excel(excel_file, sheet_name=4)    # Nominee Details
        excel_file.seek(0)
        df_subbroker = pd.read_excel(excel_file, sheet_name=5)  # Sub-Broker Assignment
    except Exception as e:
        excel_file.seek(0)
        df_personal = pd.read_excel(excel_file, sheet_name=0)
        df_passport = pd.DataFrame()
        df_intl_bank = pd.DataFrame()
        df_address = pd.DataFrame()
        df_nominee = pd.DataFrame()
        df_subbroker = pd.DataFrame()
    
    # Clean column names
    def clean_columns(df):
        if not df.empty:
            df.columns = [col.replace('*', '').strip().lower().replace(' ', '_').replace('-', '_').replace('/', '_') for col in df.columns]
        return df
    
    df_personal = clean_columns(df_personal)
    df_passport = clean_columns(df_passport)
    df_intl_bank = clean_columns(df_intl_bank)
    df_address = clean_columns(df_address)
    df_nominee = clean_columns(df_nominee)
    df_subbroker = clean_columns(df_subbroker)
    
    # Create lookup dictionaries by Passport Number
    passport_by_id = {}
    intl_bank_by_id = {}
    address_by_id = {}
    nominee_by_id = {}
    subbroker_by_id = {}
    
    if not df_passport.empty and 'passport_number' in df_passport.columns:
        for _, row in df_passport.iterrows():
            if not pd.isna(row.get('passport_number')):
                passport_by_id[str(row['passport_number']).upper().strip()] = row
    
    if not df_intl_bank.empty and 'passport_number' in df_intl_bank.columns:
        for _, row in df_intl_bank.iterrows():
            if not pd.isna(row.get('passport_number')):
                intl_bank_by_id[str(row['passport_number']).upper().strip()] = row
    
    if not df_address.empty and 'passport_number' in df_address.columns:
        for _, row in df_address.iterrows():
            if not pd.isna(row.get('passport_number')):
                address_by_id[str(row['passport_number']).upper().strip()] = row
    
    if not df_nominee.empty and 'passport_number' in df_nominee.columns:
        for _, row in df_nominee.iterrows():
            if not pd.isna(row.get('passport_number')):
                nominee_by_id[str(row['passport_number']).upper().strip()] = row
    
    if not df_subbroker.empty and 'passport_number' in df_subbroker.columns:
        for _, row in df_subbroker.iterrows():
            if not pd.isna(row.get('passport_number')):
                subbroker_by_id[str(row['passport_number']).upper().strip()] = row
    
    results = {"success": 0, "failed": 0, "errors": [], "created_clients": []}
    
    def get_val(data, key, default=''):
        if isinstance(data, pd.Series):
            val = data.get(key)
            if pd.isna(val):
                return default
            return str(val).strip()
        return default
    
    for idx, row in df_personal.iterrows():
        try:
            # Validate required fields
            name = get_val(row, 'name')
            passport_number = get_val(row, 'passport_number').upper()
            email = get_val(row, 'email')
            mobile = get_val(row, 'mobile')
            country_of_residency = get_val(row, 'country_of_residency')
            emirates_id = get_val(row, 'emirates_id')
            emirates_id_expiry = get_val(row, 'emirates_id_expiry')
            opportunities_str = get_val(row, 'opportunities_(real_estate,gift_city)') or get_val(row, 'opportunities')
            
            if not name or not passport_number:
                results['errors'].append(f"Row {idx+2}: Missing required fields (Name or Passport Number)")
                results['failed'] += 1
                continue
            
            # Check if client exists
            existing = await db.clients.find_one({"$or": [{"passport_number": passport_number}, {"photo_id": passport_number}]})
            if existing:
                results['errors'].append(f"Row {idx+2}: Client with Passport {passport_number} already exists")
                results['failed'] += 1
                continue
            
            # Validate UAE residents need Emirates ID
            if country_of_residency and country_of_residency.lower() in ['united arab emirates', 'uae']:
                if not emirates_id:
                    results['errors'].append(f"Row {idx+2}: Emirates ID required for UAE residents (Passport: {passport_number})")
                    results['failed'] += 1
                    continue
            
            # Parse opportunities
            opportunities = []
            if opportunities_str:
                opportunities = [o.strip().lower() for o in opportunities_str.split(',')]
                for opp in opportunities:
                    if opp not in ['real_estate', 'gift_city']:
                        results['errors'].append(f"Row {idx+2}: Invalid opportunity '{opp}'. Foreign passport holders can only select: real_estate, gift_city")
                        results['failed'] += 1
                        continue
            
            # Get passport details (required for all foreign clients)
            passport_row = passport_by_id.get(passport_number, {})
            passport_valid_from = get_val(passport_row, 'passport_valid_from')
            passport_valid_until = get_val(passport_row, 'passport_valid_until')
            passport_country_of_issue = get_val(passport_row, 'passport_country_of_issue')
            
            if not passport_valid_from or not passport_valid_until or not passport_country_of_issue:
                results['errors'].append(f"Row {idx+2}: Passport validity details required (Passport: {passport_number})")
                results['failed'] += 1
                continue
            
            # Get international bank details (required for foreign passport holders)
            intl_bank_row = intl_bank_by_id.get(passport_number, {})
            intl_bank_name = get_val(intl_bank_row, 'bank_name')
            intl_account_number = get_val(intl_bank_row, 'account_number')
            intl_iban = get_val(intl_bank_row, 'iban')
            intl_swift_code = get_val(intl_bank_row, 'swift_code')
            
            if not intl_bank_name or not intl_account_number or not intl_iban or not intl_swift_code:
                results['errors'].append(f"Row {idx+2}: International bank details (Bank Name, Account Number, IBAN, SWIFT) required (Passport: {passport_number})")
                results['failed'] += 1
                continue
            
            # Get other data
            address_row = address_by_id.get(passport_number, {})
            nominee_row = nominee_by_id.get(passport_number, {})
            subbroker_row = subbroker_by_id.get(passport_number, {})
            
            # Find linked sub-broker
            linked_subbroker_id = None
            sub_broker_code = get_val(subbroker_row, 'sub_broker_code')
            if sub_broker_code:
                sub_broker = await db.partners.find_one({"partner_code": sub_broker_code})
                if sub_broker:
                    linked_subbroker_id = sub_broker['id']
            
            if current_user['role'] == 'sub_broker' and not linked_subbroker_id:
                linked_subbroker_id = current_user['id']
            
            # Create client
            client_id = str(uuid.uuid4())
            user_id = str(uuid.uuid4())
            
            client_dict = {
                "id": client_id,
                "name": name,
                "photo_id": passport_number,
                "passport_number": passport_number,
                "passport_type": "foreign",
                "country_of_residency": country_of_residency,
                "emirates_id": emirates_id,
                "emirates_id_expiry": emirates_id_expiry,
                "opportunities": opportunities,
                "email": email or "",
                "mobile": mobile or "",
                "passport_valid_from": passport_valid_from,
                "passport_valid_until": passport_valid_until,
                "passport_country_of_issue": passport_country_of_issue,
                "intl_bank_name": intl_bank_name,
                "intl_account_number": intl_account_number,
                "intl_iban": intl_iban,
                "intl_swift_code": intl_swift_code,
                "occupation": get_val(row, 'occupation'),
                "date_of_birth": get_val(row, 'date_of_birth'),
                "address_line1": get_val(address_row, 'address_line_1'),
                "address_line2": get_val(address_row, 'address_line_2'),
                "city": get_val(address_row, 'city'),
                "state": get_val(address_row, 'state_region'),
                "country": get_val(address_row, 'country'),
                "pincode": get_val(address_row, 'postal_code'),
                "nominee_name": get_val(nominee_row, 'nominee_name'),
                "nominee_dob": get_val(nominee_row, 'nominee_dob'),
                "nominee_mobile": get_val(nominee_row, 'nominee_mobile'),
                "nominee_relationship": get_val(nominee_row, 'relationship'),
                "linked_subbroker_id": linked_subbroker_id,
                "created_by": current_user['id'],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "bond_allocations": [],
                "verification_status": "pending",
                "is_active": True,
                "user_id": user_id
            }
            
            # Create user account
            user_data = {
                "id": user_id,
                "pan": passport_number,
                "name": name,
                "email": email,
                "phone": mobile,
                "password_hash": get_password_hash("kinntegra123"),
                "pin_hash": get_password_hash("1234"),
                "role": "client",
                "is_active": True,
                "client_id": client_id,
                "broker_id": current_user['id'],
                "passport_type": "foreign",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.users.insert_one(user_data)
            await db.clients.insert_one(client_dict)
            
            results['success'] += 1
            results['created_clients'].append({"name": name, "passport": passport_number})
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: Error - {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.post("/bulk/clients")
async def bulk_upload_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload clients from Excel file with multiple sheets"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can bulk upload clients")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    excel_file = io.BytesIO(content)
    
    # Read all sheets - matching template structure:
    # Sheet 0: Personal Details
    # Sheet 1: Bank & Investment Details
    # Sheet 2: International Bank (NRI)
    # Sheet 3: Passport Details
    # Sheet 4: Address Details
    # Sheet 5: Nominee Details
    # Sheet 6: Sub-Broker Assignment
    try:
        df_personal = pd.read_excel(excel_file, sheet_name=0)  # Personal Details
        excel_file.seek(0)
        df_bank = pd.read_excel(excel_file, sheet_name=1)      # Bank & Investment Details
        excel_file.seek(0)
        df_intl_bank = pd.read_excel(excel_file, sheet_name=2) # International Bank (NRI)
        excel_file.seek(0)
        df_passport = pd.read_excel(excel_file, sheet_name=3)  # Passport Details
        excel_file.seek(0)
        df_address = pd.read_excel(excel_file, sheet_name=4)   # Address Details
        excel_file.seek(0)
        df_nominee = pd.read_excel(excel_file, sheet_name=5)   # Nominee Details
        excel_file.seek(0)
        df_subbroker = pd.read_excel(excel_file, sheet_name=6) # Sub-Broker Assignment
    except Exception as e:
        # If sheets don't exist, fallback to single sheet parsing
        excel_file.seek(0)
        df_personal = pd.read_excel(excel_file, sheet_name=0)
        df_bank = pd.DataFrame()
        df_intl_bank = pd.DataFrame()
        df_passport = pd.DataFrame()
        df_address = pd.DataFrame()
        df_nominee = pd.DataFrame()
        df_subbroker = pd.DataFrame()
    
    # Clean column names for all dataframes
    def clean_columns(df):
        if not df.empty:
            df.columns = [col.replace('*', '').strip().lower().replace(' ', '_').replace('-', '_').replace('/', '_') for col in df.columns]
        return df
    
    df_personal = clean_columns(df_personal)
    df_bank = clean_columns(df_bank)
    df_intl_bank = clean_columns(df_intl_bank)
    df_passport = clean_columns(df_passport)
    df_address = clean_columns(df_address)
    df_nominee = clean_columns(df_nominee)
    df_subbroker = clean_columns(df_subbroker)
    
    # Create lookup dictionaries by PAN for other sheets
    bank_by_pan = {}
    intl_bank_by_pan = {}
    passport_by_pan = {}
    address_by_pan = {}
    nominee_by_pan = {}
    subbroker_by_pan = {}
    
    if not df_bank.empty and 'pan' in df_bank.columns:
        for _, row in df_bank.iterrows():
            if not pd.isna(row.get('pan')):
                bank_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_intl_bank.empty and 'pan' in df_intl_bank.columns:
        for _, row in df_intl_bank.iterrows():
            if not pd.isna(row.get('pan')):
                intl_bank_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_passport.empty and 'pan' in df_passport.columns:
        for _, row in df_passport.iterrows():
            if not pd.isna(row.get('pan')):
                passport_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_address.empty and 'pan' in df_address.columns:
        for _, row in df_address.iterrows():
            if not pd.isna(row.get('pan')):
                address_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_nominee.empty and 'pan' in df_nominee.columns:
        for _, row in df_nominee.iterrows():
            if not pd.isna(row.get('pan')):
                nominee_by_pan[str(row['pan']).upper().strip()] = row
    
    if not df_subbroker.empty and 'pan' in df_subbroker.columns:
        for _, row in df_subbroker.iterrows():
            if not pd.isna(row.get('pan')):
                subbroker_by_pan[str(row['pan']).upper().strip()] = row
    
    results = {"success": 0, "failed": 0, "updated": 0, "created": 0, "errors": []}
    
    for idx, row in df_personal.iterrows():
        try:
            # Validate required fields
            if pd.isna(row.get('name')) or pd.isna(row.get('pan')):
                results['errors'].append(f"Row {idx+2}: Missing required fields (Name or PAN)")
                results['failed'] += 1
                continue
            
            pan = str(row['pan']).upper().strip()
            
            # Collect up to 5 UCCs (optional)
            ucc_list = []
            for i in range(1, 6):
                ucc_key = f'ucc{i}'
                ucc_val = row.get(ucc_key)
                if not pd.isna(ucc_val) and str(ucc_val).strip():
                    ucc_list.append(str(ucc_val).strip().upper())
            
            # Check for duplicate UCCs in the submitted list (only if UCCs provided)
            if len(ucc_list) > 0 and len(ucc_list) != len(set(ucc_list)):
                results['errors'].append(f"Row {idx+2}: Duplicate UCCs are not allowed")
                results['failed'] += 1
                continue
            
            # Check if any UCC already exists for a DIFFERENT client (only if UCCs provided)
            ucc_conflict = False
            if len(ucc_list) > 0:
                for ucc in ucc_list:
                    existing_ucc = await db.clients.find_one({"ucc_list": ucc, "pan_number": {"$ne": pan}})
                    if existing_ucc:
                        results['errors'].append(f"Row {idx+2}: UCC '{ucc}' is already assigned to another client")
                        ucc_conflict = True
                        break
            if ucc_conflict:
                results['failed'] += 1
                continue
            
            # Check if client with this PAN already exists - if so, UPDATE instead of CREATE
            existing_client = await db.clients.find_one({"pan_number": pan})
            existing_user = await db.users.find_one({"pan": pan})
            
            # Get data from other sheets using PAN lookup
            bank_row = bank_by_pan.get(pan, {})
            intl_bank_row = intl_bank_by_pan.get(pan, {})
            passport_row = passport_by_pan.get(pan, {})
            address_row = address_by_pan.get(pan, {})
            nominee_row = nominee_by_pan.get(pan, {})
            subbroker_row = subbroker_by_pan.get(pan, {})
            
            # Find linked sub-broker if provided (from sheet 5 or personal sheet)
            linked_subbroker_id = None
            sub_broker_code = None
            
            # Check sub-broker sheet first, then personal sheet
            if isinstance(subbroker_row, pd.Series) and not pd.isna(subbroker_row.get('sub_broker_code')):
                sub_broker_code = subbroker_row.get('sub_broker_code')
            elif not pd.isna(row.get('sub_broker_code')):
                sub_broker_code = row.get('sub_broker_code')
            
            if sub_broker_code:
                sub_broker = await db.partners.find_one({"partner_code": str(sub_broker_code).strip()})
                if sub_broker:
                    linked_subbroker_id = sub_broker['id']
                else:
                    results['errors'].append(f"Row {idx+2}: Sub-broker code {sub_broker_code} not found (client will be created/updated without link)")
            
            # For sub-broker uploads, link to themselves if no sub-broker specified
            if current_user['role'] == 'sub_broker' and not linked_subbroker_id:
                linked_subbroker_id = current_user['id']
            
            # Helper function to safely get value from row
            def get_val(data, key, default=''):
                if isinstance(data, pd.Series):
                    val = data.get(key)
                    if pd.isna(val):
                        return default
                    return str(val).strip()
                elif isinstance(data, dict):
                    return data.get(key, default)
                return default
            
            if existing_client:
                # UPDATE existing client - only update fields that are empty/missing and have new values
                update_data = {}
                
                # Helper to check if field should be updated (empty in DB, has value in upload)
                def should_update(db_val, new_val):
                    if not new_val:  # No new value provided
                        return False
                    if not db_val or db_val == '':  # DB field is empty
                        return True
                    return False
                
                # Personal details
                if should_update(existing_client.get('occupation'), get_val(row, 'occupation')):
                    update_data['occupation'] = get_val(row, 'occupation')
                if should_update(existing_client.get('date_of_birth'), get_val(row, 'date_of_birth')):
                    update_data['date_of_birth'] = get_val(row, 'date_of_birth')
                if should_update(existing_client.get('father_husband_name'), get_val(row, 'father_husband_name')):
                    update_data['father_husband_name'] = get_val(row, 'father_husband_name')
                if should_update(existing_client.get('demat_account_no'), get_val(row, 'demat_account_no')):
                    update_data['demat_account_no'] = get_val(row, 'demat_account_no')
                
                # Address details from sheet 2
                if should_update(existing_client.get('address_line1'), get_val(address_row, 'address_line_1')):
                    update_data['address_line1'] = get_val(address_row, 'address_line_1')
                if should_update(existing_client.get('address_line2'), get_val(address_row, 'address_line_2')):
                    update_data['address_line2'] = get_val(address_row, 'address_line_2')
                if should_update(existing_client.get('city'), get_val(address_row, 'city')):
                    update_data['city'] = get_val(address_row, 'city')
                if should_update(existing_client.get('state'), get_val(address_row, 'state')):
                    update_data['state'] = get_val(address_row, 'state')
                if should_update(existing_client.get('country'), get_val(address_row, 'country')):
                    update_data['country'] = get_val(address_row, 'country')
                if should_update(existing_client.get('pincode'), get_val(address_row, 'pincode')):
                    update_data['pincode'] = get_val(address_row, 'pincode')
                
                # Bank details from sheet 2 (Bank & Investment Details)
                if should_update(existing_client.get('bank_name'), get_val(bank_row, 'bank_name')):
                    update_data['bank_name'] = get_val(bank_row, 'bank_name')
                if should_update(existing_client.get('account_number'), get_val(bank_row, 'account_number')):
                    update_data['account_number'] = get_val(bank_row, 'account_number')
                if should_update(existing_client.get('branch'), get_val(bank_row, 'branch')):
                    update_data['branch'] = get_val(bank_row, 'branch')
                if should_update(existing_client.get('ifsc_code'), get_val(bank_row, 'ifsc_code')):
                    update_data['ifsc_code'] = get_val(bank_row, 'ifsc_code')
                if should_update(existing_client.get('account_type'), get_val(bank_row, 'account_type')):
                    update_data['account_type'] = get_val(bank_row, 'account_type')
                
                # International Bank details from sheet 3 (NRI)
                if should_update(existing_client.get('intl_bank_name'), get_val(intl_bank_row, 'international_bank_name')):
                    update_data['intl_bank_name'] = get_val(intl_bank_row, 'international_bank_name')
                if should_update(existing_client.get('intl_account_number'), get_val(intl_bank_row, 'international_account_number')):
                    update_data['intl_account_number'] = get_val(intl_bank_row, 'international_account_number')
                if should_update(existing_client.get('intl_iban'), get_val(intl_bank_row, 'iban')):
                    update_data['intl_iban'] = get_val(intl_bank_row, 'iban')
                if should_update(existing_client.get('intl_swift_code'), get_val(intl_bank_row, 'swift_code')):
                    update_data['intl_swift_code'] = get_val(intl_bank_row, 'swift_code')
                
                # Passport details from sheet 4
                if should_update(existing_client.get('passport_number'), get_val(passport_row, 'passport_number')):
                    update_data['passport_number'] = get_val(passport_row, 'passport_number')
                if should_update(existing_client.get('passport_valid_from'), get_val(passport_row, 'passport_valid_from')):
                    update_data['passport_valid_from'] = get_val(passport_row, 'passport_valid_from')
                if should_update(existing_client.get('passport_valid_until'), get_val(passport_row, 'passport_valid_until')):
                    update_data['passport_valid_until'] = get_val(passport_row, 'passport_valid_until')
                if should_update(existing_client.get('passport_country_of_issue'), get_val(passport_row, 'passport_country_of_issue')):
                    update_data['passport_country_of_issue'] = get_val(passport_row, 'passport_country_of_issue')
                
                # Country of residency from Personal sheet
                if should_update(existing_client.get('country_of_residency'), get_val(row, 'country_of_residency')):
                    update_data['country_of_residency'] = get_val(row, 'country_of_residency')
                
                # Passport type from Personal sheet
                if should_update(existing_client.get('passport_type'), get_val(row, 'passport_type')):
                    update_data['passport_type'] = get_val(row, 'passport_type')
                
                # Nominee details from sheet 6
                if should_update(existing_client.get('nominee_name'), get_val(nominee_row, 'nominee_name')):
                    update_data['nominee_name'] = get_val(nominee_row, 'nominee_name')
                if should_update(existing_client.get('nominee_dob'), get_val(nominee_row, 'nominee_dob')):
                    update_data['nominee_dob'] = get_val(nominee_row, 'nominee_dob')
                if should_update(existing_client.get('nominee_mobile'), get_val(nominee_row, 'nominee_mobile')):
                    update_data['nominee_mobile'] = get_val(nominee_row, 'nominee_mobile')
                if should_update(existing_client.get('nominee_relationship'), get_val(nominee_row, 'relationship')):
                    update_data['nominee_relationship'] = get_val(nominee_row, 'relationship')
                
                # Sub-broker assignment
                if should_update(existing_client.get('linked_subbroker_id'), linked_subbroker_id):
                    update_data['linked_subbroker_id'] = linked_subbroker_id
                
                # Update UCCs - merge with existing (add new ones, keep existing)
                # Handle case where ucc_list is None or doesn't exist
                existing_uccs = existing_client.get('ucc_list') or []
                if not existing_uccs:
                    # Check for old single ucc field
                    old_ucc = existing_client.get('ucc')
                    if old_ucc:
                        existing_uccs = [old_ucc]
                    else:
                        existing_uccs = []
                
                # Filter out None values and merge
                existing_uccs = [u for u in existing_uccs if u]
                merged_uccs = list(set(existing_uccs + ucc_list))[:5]  # Merge and limit to 5
                
                # Always update ucc_list if client doesn't have it or if there are new UCCs
                if not existing_client.get('ucc_list') or set(merged_uccs) != set(existing_uccs):
                    update_data['ucc_list'] = merged_uccs
                
                if update_data:
                    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
                    await db.clients.update_one({"pan_number": pan}, {"$set": update_data})
                    
                    # Also update user record if exists
                    if existing_user and 'ucc_list' in update_data:
                        await db.users.update_one({"pan": pan}, {"$set": {"ucc_list": update_data['ucc_list']}})
                    
                    results['success'] += 1
                    results['updated'] += 1
                    results['errors'].append(f"Row {idx+2}: PAN {pan} - Updated {len(update_data)} fields")
                else:
                    results['errors'].append(f"Row {idx+2}: PAN {pan} - No new data to update (all fields already filled)")
                    results['success'] += 1  # Count as success since client exists
                
                continue  # Skip creation, we've updated
            
            # Create user
            user_id = str(uuid.uuid4())
            user = {
                "id": user_id,
                "pan": pan,
                "ucc_list": ucc_list,
                "name": str(row['name']).strip(),
                "email": get_val(row, 'email'),
                "phone": get_val(row, 'mobile'),
                "password_hash": get_password_hash(get_val(row, 'password', 'kinntegra123')),
                "pin_hash": get_password_hash(get_val(row, 'pin', '1234')),
                "role": "client",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user)
            
            # Create client record with all fields from all sheets
            client = {
                "id": user_id,
                "name": str(row['name']).strip(),
                "pan_number": pan,
                "ucc_list": ucc_list,
                "email": get_val(row, 'email'),
                "mobile": get_val(row, 'mobile'),
                # Personal details from sheet 1
                "date_of_birth": get_val(row, 'date_of_birth'),
                "occupation": get_val(row, 'occupation'),
                "father_husband_name": get_val(row, 'father_husband_name'),
                "demat_account_no": get_val(row, 'demat_account_no'),
                "country_of_residency": get_val(row, 'country_of_residency'),
                "passport_type": get_val(row, 'passport_type', 'indian'),
                # Bank details from sheet 2 (Bank & Investment)
                "bank_name": get_val(bank_row, 'bank_name'),
                "account_number": get_val(bank_row, 'account_number'),
                "branch": get_val(bank_row, 'branch'),
                "ifsc_code": get_val(bank_row, 'ifsc_code'),
                "account_type": get_val(bank_row, 'account_type'),
                # International Bank details from sheet 3 (NRI)
                "intl_bank_name": get_val(intl_bank_row, 'international_bank_name'),
                "intl_account_number": get_val(intl_bank_row, 'international_account_number'),
                "intl_iban": get_val(intl_bank_row, 'iban'),
                "intl_swift_code": get_val(intl_bank_row, 'swift_code'),
                # Passport details from sheet 4
                "passport_number": get_val(passport_row, 'passport_number'),
                "passport_valid_from": get_val(passport_row, 'passport_valid_from'),
                "passport_valid_until": get_val(passport_row, 'passport_valid_until'),
                "passport_country_of_issue": get_val(passport_row, 'passport_country_of_issue'),
                # Address details from sheet 5
                "address_line1": get_val(address_row, 'address_line_1'),
                "address_line2": get_val(address_row, 'address_line_2'),
                "city": get_val(address_row, 'city'),
                "state": get_val(address_row, 'state'),
                "country": get_val(address_row, 'country', 'India'),
                "pincode": get_val(address_row, 'pincode'),
                # Nominee details from sheet 6
                "nominee_name": get_val(nominee_row, 'nominee_name'),
                "nominee_dob": get_val(nominee_row, 'nominee_dob'),
                "nominee_mobile": get_val(nominee_row, 'nominee_mobile'),
                "nominee_relationship": get_val(nominee_row, 'relationship'),
                # Sub-broker assignment
                "linked_subbroker_id": linked_subbroker_id,
                "created_by": current_user['id'],
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "bond_allocations": [],
                "real_estate_investments": []
            }
            await db.clients.insert_one(client)
            results['success'] += 1
            results['created'] += 1
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.get("/templates/pricing-calculator")
async def download_pricing_calculator_template(current_user: dict = Depends(get_current_user)):
    """Download the corrected bond pricing calculator Excel template with proper record date logic"""
    template_path = "uploads/templates/Bond_Pricing_Calculator_Corrected.xlsx"
    
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="Pricing calculator template not found")
    
    return FileResponse(
        template_path,
        filename="Bond_Pricing_Calculator_Corrected.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@api_router.get("/bulk/template/bonds")
async def download_bond_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk bond upload with all fields"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Basic Bond Information
    ws_basic = wb.active
    ws_basic.title = "Bond Details"
    
    basic_headers = ["Bond Code*", "Bond Name*", "ISIN", "Issuer/Company Name", 
                     "Start Date*", "Maturity Date*", "Description"]
    for col, header in enumerate(basic_headers, 1):
        cell = ws_basic.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_basic.column_dimensions[get_column_letter(col)].width = 20
    
    basic_sample = ["ABC-NCD-2025", "ABC Corp NCD 2025", "INE123A45678", "ABC Corporation Ltd", 
                   "2025-01-15", "2027-01-15", "Secured NCD with quarterly interest"]
    for col, value in enumerate(basic_sample, 1):
        ws_basic.cell(row=2, column=col, value=value)
    
    # Sheet 2: Financial Details
    ws_financial = wb.create_sheet("Financial Details")
    
    financial_headers = ["Bond Code*", "Coupon Rate (%)*", "Primary IRR (%)*", 
                        "Secondary IRR (%)*", "Face Value per Unit"]
    for col, header in enumerate(financial_headers, 1):
        cell = ws_financial.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_financial.column_dimensions[get_column_letter(col)].width = 22
    
    financial_sample = ["ABC-NCD-2025", 12.5, 14.0, 12.0, 100000]
    for col, value in enumerate(financial_sample, 1):
        ws_financial.cell(row=2, column=col, value=value)
    
    # Sheet 3: Units & Limits (simplified - removed Interest Frequency and Cutoff Days)
    ws_units = wb.create_sheet("Units & Limits")
    
    units_headers = ["Bond Code*", "Total Units*", "Minimum Units per Order"]
    for col, header in enumerate(units_headers, 1):
        cell = ws_units.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_units.column_dimensions[get_column_letter(col)].width = 25
    
    units_sample = ["ABC-NCD-2025", 10, 1]
    for col, value in enumerate(units_sample, 1):
        ws_units.cell(row=2, column=col, value=value)
    
    # Sheet 4: Cashflows Per Unit (Primary sheet for cashflow schedules)
    ws_cashflows = wb.create_sheet("Cashflows Per Unit")
    
    cashflow_headers = ["Bond Code*", "Payment Date*", "Interest Per Unit*", "Principal Per Unit*"]
    for col, header in enumerate(cashflow_headers, 1):
        cell = ws_cashflows.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0891B2", end_color="0891B2", fill_type="solid")  # Cyan
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_cashflows.column_dimensions[get_column_letter(col)].width = 22
    
    # Sample cashflows (like CDUCIC01 bond)
    cashflow_samples = [
        ["ABC-NCD-2025", "2025-04-24", 5308.22, 27777.78],
        ["ABC-NCD-2025", "2025-05-24", 4851.60, 27777.78],
        ["ABC-NCD-2025", "2025-06-24", 4718.42, 27777.78],
        ["ABC-NCD-2025", "2025-07-24", 4280.82, 27777.78],
    ]
    for row_idx, sample in enumerate(cashflow_samples, 2):
        for col, value in enumerate(sample, 1):
            ws_cashflows.cell(row=row_idx, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK BOND UPLOAD INSTRUCTIONS",
        "",
        "This template has 4 data sheets. Fill required sheets.",
        "Bond Code is used to link data across sheets.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Bond Details (Green) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Bond Code*: Unique identifier (e.g., ABC-NCD-2025)",
        "• Bond Name*: Full name of the bond issue",
        "• ISIN: International Securities Identification Number (optional)",
        "• Issuer/Company Name: Company issuing the bond",
        "• Start Date*: Bond issue date (YYYY-MM-DD)",
        "• Maturity Date*: Final maturity date (YYYY-MM-DD)",
        "• Description: Additional details about the bond",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Financial Details (Purple) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Coupon Rate*: Annual interest rate as percentage",
        "• Primary IRR*: Expected IRR for primary buyer",
        "• Secondary IRR*: Target IRR for secondary market trading",
        "• Face Value per Unit: Value of each unit (optional)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 3 - Units & Limits (Orange) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Total Units*: Number of units available (default: 1)",
        "• Minimum Units: Minimum purchase quantity (default: 1)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 4 - Cashflows Per Unit (Cyan) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Exact interest and principal amounts PER UNIT for each date",
        "• Use this for PRECISE cashflow matching",
        "• Copy from your bond's actual repayment schedule",
        "• System will use these EXACT values for client cashflows",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. Bond Code must be unique and match across all sheets",
        "2. Cashflows Per Unit provides exact payment amounts",
        "3. Historical trades will use Sheet 4 cashflows × client units",
        "4. Maximum 50 bonds per upload",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("BULK") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 70
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=bond_template.xlsx"}
    )


@api_router.post("/bulk/bonds")
async def bulk_upload_bonds(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload bonds from Excel file"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload bonds")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    excel_file = io.BytesIO(content)
    
    # Read all sheets from the Excel file
    try:
        # Sheet 1: Bond Details
        df_basic = pd.read_excel(excel_file, sheet_name=0)
        df_basic.columns = [col.replace('*', '').replace('(%)', '').strip().lower().replace(' ', '_').replace('/', '_') for col in df_basic.columns]
        
        # Sheet 2: Financial Details  
        excel_file.seek(0)
        df_financial = pd.read_excel(excel_file, sheet_name=1)
        df_financial.columns = [col.replace('*', '').replace('(%)', '').replace('(INR)', '').strip().lower().replace(' ', '_') for col in df_financial.columns]
        
        # Sheet 3: Units & Limits
        excel_file.seek(0)
        df_units = pd.read_excel(excel_file, sheet_name=2)
        df_units.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df_units.columns]
        
        # Sheet 4: Cashflows Per Unit (required for cashflow schedules)
        excel_file.seek(0)
        try:
            df_cashflows = pd.read_excel(excel_file, sheet_name=3)
            df_cashflows.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df_cashflows.columns]
        except:
            df_cashflows = pd.DataFrame()  # Empty if sheet doesn't exist
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading Excel sheets: {str(e)}. Ensure the file has the required sheets.")
    
    # Merge dataframes on bond_code
    df = df_basic.merge(df_financial, on='bond_code', how='left')
    df = df.merge(df_units, on='bond_code', how='left')
    
    results = {"success": 0, "failed": 0, "errors": [], "created_bonds": []}
    
    # Group cashflows per unit by bond_code (for exact cashflow schedules)
    cashflows_per_unit_map = {}
    if not df_cashflows.empty:
        for _, crow in df_cashflows.iterrows():
            bc = str(crow.get('bond_code', '')).strip()
            if bc and not pd.isna(bc):
                if bc not in cashflows_per_unit_map:
                    cashflows_per_unit_map[bc] = []
                payment_date = crow.get('payment_date')
                interest = crow.get('interest_per_unit')
                principal = crow.get('principal_per_unit')
                if not pd.isna(payment_date):
                    try:
                        date_str = pd.to_datetime(payment_date).strftime('%Y-%m-%d')
                        cashflows_per_unit_map[bc].append({
                            "date": date_str,
                            "interest_per_unit": float(interest) if not pd.isna(interest) else 0,
                            "principal_per_unit": float(principal) if not pd.isna(principal) else 0
                        })
                    except:
                        pass
        # Sort each bond's cashflows by date
        for bc in cashflows_per_unit_map:
            cashflows_per_unit_map[bc].sort(key=lambda x: x['date'])
    
    for idx, row in df.iterrows():
        try:
            # Validate required fields - using standardized column names after cleaning
            required_fields = ['bond_code', 'bond_name', 'coupon_rate', 
                              'primary_irr', 'secondary_irr', 'start_date', 'maturity_date']
            
            missing = [f for f in required_fields if f not in row.index or pd.isna(row.get(f))]
            if missing:
                results['errors'].append(f"Row {idx+2}: Missing required fields: {', '.join(missing)}")
                results['failed'] += 1
                continue
            
            bond_code = str(row['bond_code']).strip()
            
            # Check for duplicate bond code
            existing = await db.bonds.find_one({"bond_code": bond_code})
            if existing:
                results['errors'].append(f"Row {idx+2}: Bond code {bond_code} already exists")
                results['failed'] += 1
                continue
            
            # Parse dates
            start_date = pd.to_datetime(row['start_date']).strftime('%Y-%m-%d')
            end_date = pd.to_datetime(row['maturity_date']).strftime('%Y-%m-%d')
            
            # Get financial details
            coupon_rate_val = float(row['coupon_rate'])
            face_value = float(row.get('face_value_per_unit', 100000)) if pd.notna(row.get('face_value_per_unit')) else 100000
            
            # Check if we have exact cashflows per unit from Sheet 4
            cashflows_per_unit = cashflows_per_unit_map.get(bond_code, [])
            
            # Calculate total principal and interest from cashflows_per_unit if available
            total_principal_per_unit = 0
            total_interest_per_unit = 0
            if cashflows_per_unit:
                total_principal_per_unit = sum(cf.get('principal_per_unit', 0) for cf in cashflows_per_unit)
                total_interest_per_unit = sum(cf.get('interest_per_unit', 0) for cf in cashflows_per_unit)
            
            bond_id = str(uuid.uuid4())
            
            bond = {
                "id": bond_id,
                "bond_code": bond_code,
                "name": str(row['bond_name']).strip(),
                "isin": str(row.get('isin', '')) if not pd.isna(row.get('isin')) else '',
                "coupon_rate": coupon_rate_val,
                "primary_irr": float(row['primary_irr']),
                "secondary_irr": float(row['secondary_irr']),
                "start_date": start_date,
                "end_date": end_date,
                "total_units": int(row.get('total_units', 1)) if not pd.isna(row.get('total_units')) else 1,
                "units_sold": 0,
                "min_units": int(row.get('minimum_units_per_order', 1)) if not pd.isna(row.get('minimum_units_per_order')) else 1,
                "face_value": face_value,
                "cashflows_per_unit": cashflows_per_unit,  # Exact cashflows per unit from Excel
                "total_principal_per_unit": total_principal_per_unit,
                "total_interest_per_unit": total_interest_per_unit,
                "issuer": str(row.get('issuer_company_name', '')) if not pd.isna(row.get('issuer_company_name')) else '',
                "description": str(row.get('description', '')) if not pd.isna(row.get('description')) else '',
                "created_by": current_user['id'],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "listing_status": "active"  # Make bond visible in opportunities immediately
            }
            
            await db.bonds.insert_one(bond)
            results['success'] += 1
            results['created_bonds'].append({
                "id": bond_id, 
                "name": bond['name'], 
                "code": bond_code,
                "total_units": bond['total_units'],
                "cashflows_count": len(cashflows_per_unit)
            })
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.get("/bulk/template/real-estate")
async def download_real_estate_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk real estate upload"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Basic Information
    ws_basic = wb.active
    ws_basic.title = "Basic Information"
    
    basic_headers = [
        "Building Name*", "Unit No*", "Developer Name*", "Location", 
        "Description", "Handover Date"
    ]
    for col, header in enumerate(basic_headers, 1):
        cell = ws_basic.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1D4ED8", end_color="1D4ED8", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_basic.column_dimensions[get_column_letter(col)].width = 20
    
    # Sample data for Basic Info
    basic_sample = ["Palm Tower", "1201", "Emaar Properties", "Dubai Marina", 
                   "Luxury 2BR apartment with sea view", "2026-06-30"]
    for col, value in enumerate(basic_sample, 1):
        ws_basic.cell(row=2, column=col, value=value)
    
    # Sheet 2: Pricing & Fees
    ws_pricing = wb.create_sheet("Pricing & Fees")
    
    pricing_headers = [
        "Building Name*", "Unit No*", "Unit Price (AED)*", "DLD Fee (%)*", 
        "Admin Fee (AED)*", "Broker Fee (AED)", "Other Fees (AED)", 
        "Unit Selling Fee (%)", "Developer Discount (AED)", "Developer Discount (%)"
    ]
    for col, header in enumerate(pricing_headers, 1):
        cell = ws_pricing.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_pricing.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample data for Pricing
    pricing_sample = ["Palm Tower", "1201", 2500000, 4, 5000, 25000, 2000, 2, 50000, ""]
    for col, value in enumerate(pricing_sample, 1):
        ws_pricing.cell(row=2, column=col, value=value)
    
    # Sheet 3: Unit Details
    ws_unit = wb.create_sheet("Unit Details")
    
    unit_headers = [
        "Building Name*", "Unit No*", "Unit Type*", "Floor*", 
        "Total Area (sqft)*", "Carpet Area (sqft)", "Balcony Area (sqft)", 
        "Parking Spaces"
    ]
    for col, header in enumerate(unit_headers, 1):
        cell = ws_unit.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_unit.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample data for Unit Details
    unit_sample = ["Palm Tower", "1201", "2BR", 12, 1200, 1100, 100, 1]
    for col, value in enumerate(unit_sample, 1):
        ws_unit.cell(row=2, column=col, value=value)
    
    # Sheet 4: Sale Settings
    ws_sale = wb.create_sheet("Sale Settings")
    
    sale_headers = [
        "Building Name*", "Unit No*", "Expected Sale Rate (AED/sqft)", 
        "Estimated Sell Date", "Eligible to Sell After (%)"
    ]
    for col, header in enumerate(sale_headers, 1):
        cell = ws_sale.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_sale.column_dimensions[get_column_letter(col)].width = 22
    
    # Sample data for Sale Settings
    sale_sample = ["Palm Tower", "1201", 2800, "2027-01-15", 100]
    for col, value in enumerate(sale_sample, 1):
        ws_sale.cell(row=2, column=col, value=value)
    
    # Sheet 5: Payment Schedule
    ws_payments = wb.create_sheet("Payment Schedule")
    
    pay_headers = ["Building Name*", "Unit No*", "Payment Description*", "Due Date*", "Percentage*"]
    for col, header in enumerate(pay_headers, 1):
        cell = ws_payments.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_payments.column_dimensions[get_column_letter(col)].width = 20
    
    # Sample payment schedule
    sample_payments = [
        ["Palm Tower", "1201", "Booking Amount", "2025-02-01", 20],
        ["Palm Tower", "1201", "1st Installment", "2025-06-01", 10],
        ["Palm Tower", "1201", "2nd Installment", "2025-12-01", 10],
        ["Palm Tower", "1201", "3rd Installment", "2026-03-01", 10],
        ["Palm Tower", "1201", "Handover Payment", "2026-06-30", 50],
    ]
    for row_idx, payment in enumerate(sample_payments, 2):
        for col, value in enumerate(payment, 1):
            ws_payments.cell(row=row_idx, column=col, value=value)
    
    # Sheet 6: Instructions
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK REAL ESTATE UPLOAD INSTRUCTIONS",
        "",
        "This template has 5 data sheets. Fill all sheets for complete property information.",
        "Fields marked with * are required.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Basic Information (Blue)",
        "═══════════════════════════════════════════════════════════════",
        "• Building Name*: Name of the building/project (must be consistent across all sheets)",
        "• Unit No*: Unit number/identifier (must be consistent across all sheets)",
        "• Developer Name*: Developer/builder name",
        "• Location: Area/locality (e.g., Dubai Marina, Downtown)",
        "• Description: Property description and features",
        "• Handover Date: Expected handover date (YYYY-MM-DD format)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Pricing & Fees (Green)",
        "═══════════════════════════════════════════════════════════════",
        "• Unit Price*: Base price in AED (excluding fees)",
        "• DLD Fee*: Dubai Land Department fee as percentage (typically 4%)",
        "• Admin Fee*: Administrative fee in AED (paid upfront with booking)",
        "• Broker Fee: Brokerage fee in AED (if any)",
        "• Other Fees: Any other fees in AED",
        "• Unit Selling Fee: Fee percentage when selling (0-2.5%)",
        "• Developer Discount (AED): Discount amount offered by developer in AED",
        "• Developer Discount (%): Or discount as percentage (use one or the other)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 3 - Unit Details (Purple)",
        "═══════════════════════════════════════════════════════════════",
        "• Unit Type*: Type of unit (e.g., Studio, 1BR, 2BR, 3BR, Penthouse, Villa)",
        "• Floor*: Floor number",
        "• Total Area*: Total area in square feet",
        "• Carpet Area: Built-up area in square feet",
        "• Balcony Area: Balcony area in square feet",
        "• Parking Spaces: Number of parking spots (default: 1)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 4 - Sale Settings (Red)",
        "═══════════════════════════════════════════════════════════════",
        "• Expected Sale Rate: Expected sale price per sqft in AED",
        "• Estimated Sell Date: Target date to sell (YYYY-MM-DD format)",
        "• Eligible to Sell After: Minimum payment % before selling (default: 100)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 5 - Payment Schedule (Orange)",
        "═══════════════════════════════════════════════════════════════",
        "• Building Name & Unit No: Must match exactly with other sheets",
        "• Payment Description*: Name of the milestone (e.g., Booking, 1st Installment)",
        "• Due Date*: Payment due date (YYYY-MM-DD format)",
        "• Percentage*: Percentage of unit price for this milestone",
        "• NOTE: Total percentages for each property MUST equal 100%",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. Building Name and Unit No must be IDENTICAL across all sheets",
        "2. Use YYYY-MM-DD format for all dates (e.g., 2025-06-30)",
        "3. Payment schedule percentages must sum to exactly 100%",
        "4. If no payment schedule provided, default 20/30/30/20 will be used",
        "5. Maximum 30 properties per upload",
        "6. Photos and brochures can be uploaded after property creation",
        "7. Numbers should not include currency symbols or commas",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("BULK") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 80
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=real_estate_template.xlsx"}
    )


@api_router.post("/bulk/real-estate")
async def bulk_upload_real_estate(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload real estate opportunities from Excel file with multiple sheets"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload real estate")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    excel_file = pd.ExcelFile(io.BytesIO(content))
    
    # Helper to normalize column names
    def normalize_columns(df):
        # Normalize column names but keep indicators for % vs AED columns
        normalized = []
        for col in df.columns:
            # First, identify if it's a percentage or AED column
            is_percent = '(%)' in col
            is_aed = '(AED)' in col
            
            # Remove markers and clean up
            name = col.replace('*', '').replace('(%)', '').replace('(AED)', '').replace('(sqft)', '')
            name = name.replace('(AED/sqft)', '').strip().lower().replace(' ', '_').replace('/', '_')
            
            # Add suffix for developer_discount to differentiate
            if 'developer_discount' in name:
                if is_percent:
                    name = 'developer_discount_percentage'
                else:
                    name = 'developer_discount_aed'
            
            normalized.append(name)
        
        df.columns = normalized
        return df
    
    # Read all sheets
    sheets_data = {}
    sheet_mapping = {
        'Basic Information': 'basic',
        'Pricing & Fees': 'pricing',
        'Unit Details': 'unit',
        'Sale Settings': 'sale',
        'Payment Schedule': 'payments'
    }
    
    for sheet_name, key in sheet_mapping.items():
        if sheet_name in excel_file.sheet_names:
            df = pd.read_excel(excel_file, sheet_name=sheet_name)
            sheets_data[key] = normalize_columns(df)
    
    # Fallback to old single-sheet format if new sheets not found
    if 'basic' not in sheets_data:
        # Try reading from first sheet (old format)
        df = pd.read_excel(excel_file, sheet_name=0)
        df = normalize_columns(df)
        sheets_data['main'] = df
        
        # Try old Payment Schedule sheet
        if 'Payment Schedule' in excel_file.sheet_names:
            pay_df = pd.read_excel(excel_file, sheet_name='Payment Schedule')
            sheets_data['payments'] = normalize_columns(pay_df)
    
    results = {"success": 0, "failed": 0, "errors": [], "created_properties": []}
    
    # Get unique properties from basic info or main sheet
    if 'basic' in sheets_data:
        basic_df = sheets_data['basic']
        properties = basic_df[['building_name', 'unit_no']].drop_duplicates()
    elif 'main' in sheets_data:
        properties = sheets_data['main'][['building_name', 'unit_no']].drop_duplicates()
    else:
        raise HTTPException(status_code=400, detail="No valid data sheets found")
    
    for _, prop_row in properties.iterrows():
        try:
            building_name = str(prop_row['building_name']).strip()
            unit_no = str(prop_row['unit_no']).strip()
            
            if pd.isna(prop_row['building_name']) or pd.isna(prop_row['unit_no']):
                continue
            
            # Check for duplicate
            existing = await db.real_estate_opportunities.find_one({
                "building_name": building_name,
                "unit_no": unit_no,
                "created_by": current_user['id']
            })
            if existing:
                results['errors'].append(f"Property {building_name} - Unit {unit_no} already exists")
                results['failed'] += 1
                continue
            
            # Gather data from all sheets
            property_data = {
                'building_name': building_name,
                'unit_no': unit_no
            }
            
            # New multi-sheet format
            if 'basic' in sheets_data:
                # Basic Information
                basic_row = sheets_data['basic'][
                    (sheets_data['basic']['building_name'].str.strip() == building_name) & 
                    (sheets_data['basic']['unit_no'].astype(str).str.strip() == unit_no)
                ]
                if not basic_row.empty:
                    row = basic_row.iloc[0]
                    property_data['developer_name'] = str(row.get('developer_name', '')).strip() if not pd.isna(row.get('developer_name')) else ''
                    property_data['location'] = str(row.get('location', '')).strip() if not pd.isna(row.get('location')) else ''
                    property_data['description'] = str(row.get('description', '')).strip() if not pd.isna(row.get('description')) else ''
                    property_data['handover_date'] = pd.to_datetime(row['handover_date']).strftime('%Y-%m-%d') if not pd.isna(row.get('handover_date')) else None
                
                # Pricing & Fees
                if 'pricing' in sheets_data:
                    pricing_row = sheets_data['pricing'][
                        (sheets_data['pricing']['building_name'].str.strip() == building_name) & 
                        (sheets_data['pricing']['unit_no'].astype(str).str.strip() == unit_no)
                    ]
                    if not pricing_row.empty:
                        row = pricing_row.iloc[0]
                        property_data['unit_price'] = float(row['unit_price']) if not pd.isna(row.get('unit_price')) else 0
                        property_data['dld_fee_percentage'] = float(row['dld_fee']) if not pd.isna(row.get('dld_fee')) else 4
                        property_data['admin_fee'] = float(row['admin_fee']) if not pd.isna(row.get('admin_fee')) else 0
                        property_data['broker_fee'] = float(row.get('broker_fee', 0)) if not pd.isna(row.get('broker_fee')) else 0
                        property_data['other_fees'] = float(row.get('other_fees', 0)) if not pd.isna(row.get('other_fees')) else 0
                        property_data['selling_fee_percentage'] = float(row.get('unit_selling_fee', 0)) if not pd.isna(row.get('unit_selling_fee')) else 0
                        # Developer Discount fields
                        property_data['developer_discount'] = float(row.get('developer_discount_aed', 0)) if not pd.isna(row.get('developer_discount_aed')) else 0
                        property_data['developer_discount_percentage'] = float(row.get('developer_discount_percentage', 0)) if not pd.isna(row.get('developer_discount_percentage')) else 0
                
                # Unit Details
                if 'unit' in sheets_data:
                    unit_row = sheets_data['unit'][
                        (sheets_data['unit']['building_name'].str.strip() == building_name) & 
                        (sheets_data['unit']['unit_no'].astype(str).str.strip() == unit_no)
                    ]
                    if not unit_row.empty:
                        row = unit_row.iloc[0]
                        property_data['unit_type'] = str(row['unit_type']).strip() if not pd.isna(row.get('unit_type')) else '1BR'
                        property_data['floor'] = str(row['floor']) if not pd.isna(row.get('floor')) else '1'
                        property_data['total_area'] = float(row['total_area']) if not pd.isna(row.get('total_area')) else 0
                        property_data['carpet_area'] = float(row.get('carpet_area', row.get('total_area', 0))) if not pd.isna(row.get('carpet_area')) else property_data.get('total_area', 0)
                        property_data['balcony_area'] = float(row.get('balcony_area', 0)) if not pd.isna(row.get('balcony_area')) else 0
                        property_data['parking_spaces'] = int(row.get('parking_spaces', 1)) if not pd.isna(row.get('parking_spaces')) else 1
                
                # Sale Settings
                if 'sale' in sheets_data:
                    sale_row = sheets_data['sale'][
                        (sheets_data['sale']['building_name'].str.strip() == building_name) & 
                        (sheets_data['sale']['unit_no'].astype(str).str.strip() == unit_no)
                    ]
                    if not sale_row.empty:
                        row = sale_row.iloc[0]
                        property_data['expected_sale_rate'] = float(row.get('expected_sale_rate', 0)) if not pd.isna(row.get('expected_sale_rate')) else None
                        property_data['estimated_sell_date'] = pd.to_datetime(row['estimated_sell_date']).strftime('%Y-%m-%d') if not pd.isna(row.get('estimated_sell_date')) else None
                        property_data['eligible_to_sell_after_percentage'] = float(row.get('eligible_to_sell_after', 100)) if not pd.isna(row.get('eligible_to_sell_after')) else 100
            
            # Old single-sheet format fallback
            elif 'main' in sheets_data:
                main_row = sheets_data['main'][
                    (sheets_data['main']['building_name'].str.strip() == building_name) & 
                    (sheets_data['main']['unit_no'].astype(str).str.strip() == unit_no)
                ]
                if not main_row.empty:
                    row = main_row.iloc[0]
                    property_data['developer_name'] = str(row.get('developer', '')).strip() if not pd.isna(row.get('developer')) else ''
                    property_data['unit_price'] = float(row['unit_price']) if not pd.isna(row.get('unit_price')) else 0
                    property_data['total_area'] = float(row['total_area']) if not pd.isna(row.get('total_area')) else 0
                    property_data['carpet_area'] = float(row.get('carpet_area', row['total_area'])) if not pd.isna(row.get('carpet_area')) else property_data['total_area']
                    property_data['balcony_area'] = float(row.get('balcony_area', 0)) if not pd.isna(row.get('balcony_area')) else 0
                    property_data['location'] = str(row.get('location', '')).strip() if not pd.isna(row.get('location')) else ''
                    property_data['dld_fee_percentage'] = float(row.get('dld_fee', 4)) if not pd.isna(row.get('dld_fee')) else 4
                    property_data['admin_fee'] = float(row.get('admin_fee', 0)) if not pd.isna(row.get('admin_fee')) else 0
                    property_data['broker_fee'] = float(row.get('brokerage_fee', 0)) if not pd.isna(row.get('brokerage_fee')) else 0
                    property_data['other_fees'] = float(row.get('other_fees', 0)) if not pd.isna(row.get('other_fees')) else 0
                    property_data['selling_fee_percentage'] = float(row.get('selling_fee', 0)) if not pd.isna(row.get('selling_fee')) else 0
                    property_data['unit_type'] = str(row.get('unit_type', '1BR')).strip()
                    property_data['floor'] = str(row.get('floor', '1'))
                    property_data['parking_spaces'] = int(row.get('parking_spaces', 1)) if not pd.isna(row.get('parking_spaces')) else 1
                    property_data['handover_date'] = pd.to_datetime(row['handover_date']).strftime('%Y-%m-%d') if not pd.isna(row.get('handover_date')) else None
            
            # Validate required fields
            required = ['unit_price', 'total_area']
            missing = [f for f in required if not property_data.get(f)]
            if missing:
                results['errors'].append(f"{building_name} - Unit {unit_no}: Missing {', '.join(missing)}")
                results['failed'] += 1
                continue
            
            # Get payment schedule
            payment_schedule = []
            if 'payments' in sheets_data:
                property_payments = sheets_data['payments'][
                    (sheets_data['payments']['building_name'].str.strip().str.lower() == building_name.lower()) &
                    (sheets_data['payments']['unit_no'].astype(str).str.strip() == unit_no)
                ]
                for _, pay_row in property_payments.iterrows():
                    payment_schedule.append({
                        "description": str(pay_row.get('payment_description', '')).strip(),
                        "date": pd.to_datetime(pay_row['due_date']).strftime('%Y-%m-%d'),
                        "percentage": float(pay_row['percentage'])
                    })
            
            # Default payment schedule if none provided
            if not payment_schedule:
                handover_date = property_data.get('handover_date')
                base_date = datetime.now()
                if handover_date:
                    base_date = datetime.strptime(handover_date, '%Y-%m-%d')
                
                payment_schedule = [
                    {"description": "Booking", "date": datetime.now().strftime('%Y-%m-%d'), "percentage": 20},
                    {"description": "1st Installment", "date": (datetime.now() + timedelta(days=120)).strftime('%Y-%m-%d'), "percentage": 30},
                    {"description": "2nd Installment", "date": (datetime.now() + timedelta(days=240)).strftime('%Y-%m-%d'), "percentage": 30},
                    {"description": "Handover", "date": base_date.strftime('%Y-%m-%d'), "percentage": 20}
                ]
            
            # Calculate fees
            unit_price = property_data.get('unit_price', 0)
            dld_fee_pct = property_data.get('dld_fee_percentage', 4)
            dld_fee = unit_price * dld_fee_pct / 100
            total_cost = unit_price + dld_fee + property_data.get('admin_fee', 0) + property_data.get('broker_fee', 0) + property_data.get('other_fees', 0)
            
            # Create opportunity
            opp_id = str(uuid.uuid4())
            opportunity = {
                "id": opp_id,
                "building_name": building_name,
                "developer_name": property_data.get('developer_name', ''),
                "unit_no": unit_no,
                "floor": property_data.get('floor', '1'),
                "unit_type": property_data.get('unit_type', '1BR'),
                "property_type": "off_plan",
                "unit_price": unit_price,
                "total_area": property_data.get('total_area', 0),
                "carpet_area": property_data.get('carpet_area', property_data.get('total_area', 0)),
                "balcony_area": property_data.get('balcony_area', 0),
                "location": property_data.get('location', ''),
                "description": property_data.get('description', ''),
                "dld_fee_percentage": dld_fee_pct,
                "dld_fee": dld_fee,
                "admin_fee": property_data.get('admin_fee', 0),
                "brokerage_fee": property_data.get('broker_fee', 0),
                "other_fees": property_data.get('other_fees', 0),
                "selling_fee_percentage": property_data.get('selling_fee_percentage', 0),
                "total_cost": total_cost,
                "payment_schedule": payment_schedule,
                "handover_date": property_data.get('handover_date'),
                "parking_spaces": property_data.get('parking_spaces', 1),
                "expected_sale_rate": property_data.get('expected_sale_rate'),
                "estimated_sell_date": property_data.get('estimated_sell_date'),
                "eligible_to_sell_after_percentage": property_data.get('eligible_to_sell_after_percentage', 100),
                "max_investors": 4,
                "current_investors": 0,
                "investors": [],
                "investor_payments": [],
                "interested_users": [],
                "invested_percentage": 0,
                "remaining_percentage": 100,
                "status": "available",
                "images": [],
                "presentations": [],
                "created_by": current_user['id'],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.real_estate_opportunities.insert_one(opportunity)
            results['success'] += 1
            results['created_properties'].append({
                "id": opp_id, 
                "name": f"{building_name} - Unit {unit_no}"
            })
            
        except Exception as e:
            results['errors'].append(f"{building_name} - Unit {unit_no}: {str(e)}")
            results['failed'] += 1
    
    return results


# ==================== BULK INVESTMENT DETAILS UPLOAD ====================

@api_router.get("/bulk/template/investment-details")
async def download_investment_details_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk investment details upload (investments only, no repayments)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Investment Details
    ws_investments = wb.active
    ws_investments.title = "Investment Details"
    
    inv_headers = ["Deal ID*", "Date of Investment*", "PAN*", "No of Units*", "Amount*", "UTR"]
    
    header_fill = PatternFill(start_color="0D9488", end_color="0D9488", fill_type="solid")  # Teal color
    header_font = Font(bold=True, color="FFFFFF")
    
    for col, header in enumerate(inv_headers, 1):
        cell = ws_investments.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_investments.column_dimensions[get_column_letter(col)].width = 20
    
    # Sample investment data
    inv_sample = [
        ["CDNRE001", "2025-04-30", "ABCDE1234F", 34, 3916923.08, "UTR123456789"],
        ["CDNRE001", "2025-05-02", "XYZPQ5678G", 43, 4956833, "UTR987654321"],
    ]
    for row_idx, row_data in enumerate(inv_sample, 2):
        for col, value in enumerate(row_data, 1):
            ws_investments.cell(row=row_idx, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "═══════════════════════════════════════════════════════════════════",
        "       INVESTMENT DETAILS UPLOAD - INSTRUCTIONS",
        "═══════════════════════════════════════════════════════════════════",
        "",
        "⚠️  PREREQUISITE: CREATE BONDS & CLIENTS FIRST!",
        "────────────────────────────────────────────────────────────────────",
        "Before uploading investment details, you MUST:",
        "1. Create all bonds/deals in the system first (Go to Opportunities > Create Bond)",
        "2. Create all clients in the system (Go to Client Management > Add Client)",
        "3. The Deal ID in this file must match the Bond Code in the system",
        "",
        "═══════════════════════════════════════════════════════════════════",
        "INVESTMENT DETAILS SHEET",
        "═══════════════════════════════════════════════════════════════════",
        "Records when clients invested in a bond",
        "",
        "Required Fields:",
        "• Deal ID*: Bond code (must match existing bond in system)",
        "• Date of Investment*: When the investment was made (YYYY-MM-DD)",
        "• PAN*: Client's PAN number (must match existing client)",
        "• No of Units*: Number of units purchased",
        "• Amount*: Total investment amount",
        "",
        "Optional Fields:",
        "• UTR: Payment reference number",
        "",
        "═══════════════════════════════════════════════════════════════════",
        "NOTES",
        "═══════════════════════════════════════════════════════════════════",
        "• This upload creates investment/trade records only",
        "• For repayment data, use the 'Historical Repayments' tab",
        "• Duplicate investments (same bond, client, date, units) will be skipped",
        "• Bond status will be updated to 'funded' if it has investments",
    ]
    
    for row_idx, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row_idx, column=1, value=text)
        if "═" in text or "PREREQUISITE" in text:
            cell.font = Font(bold=True)
    
    ws_instructions.column_dimensions['A'].width = 75
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=investment_details_template.xlsx"}
    )


@api_router.post("/bulk/investment-details")
async def bulk_upload_investment_details(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Bulk upload investment details only (no repayments).
    Creates trades for historical investments.
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload investment details")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    
    results = {
        "success": 0,
        "failed": 0,
        "errors": [],
        "investments_created": 0,
        "created_trades": [],
        "bonds_status_updated": [],  # Will show available units and funded status
        "validation_summary": {
            "total_investment_rows": 0
        }
    }
    
    # Get all bonds and clients for lookup
    all_bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    all_clients = await db.clients.find({}, {"_id": 0}).to_list(10000)
    
    # Create lookup dictionaries
    bond_lookup = {b.get('bond_code', '').strip().upper(): b for b in all_bonds if b.get('bond_code')}
    bond_by_id = {b['id']: b for b in all_bonds}
    client_by_pan = {c.get('pan_number', '').strip().upper(): c for c in all_clients if c.get('pan_number')}
    
    try:
        # Read Investment Details sheet (first sheet or named sheet)
        try:
            # Try named sheet first
            df_investments = pd.read_excel(io.BytesIO(content), sheet_name="Investment Details")
        except Exception:
            # Fall back to first sheet
            df_investments = pd.read_excel(io.BytesIO(content), sheet_name=0)
        
        df_investments.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df_investments.columns]
        
        if len(df_investments) == 0:
            raise HTTPException(status_code=400, detail="No data found in the uploaded file")
        
        results['validation_summary']['total_investment_rows'] = len(df_investments)
        
        required_inv_cols = ['deal_id', 'date_of_investment', 'pan', 'no_of_units', 'amount']
        missing_cols = [col for col in required_inv_cols if col not in df_investments.columns]
        if missing_cols:
            raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing_cols)}")
        
        bonds_with_new_investments = set()
        
        for idx, row in df_investments.iterrows():
            row_num = idx + 2
            try:
                if pd.isna(row.get('deal_id')) or pd.isna(row.get('pan')):
                    continue
                
                deal_id = str(row['deal_id']).strip().upper()
                pan = str(row['pan']).strip().upper()
                units = int(row['no_of_units'])
                amount = float(row['amount'])
                utr = str(row.get('utr', '')) if pd.notna(row.get('utr')) else None
                
                # Parse investment date
                inv_date = row['date_of_investment']
                if isinstance(inv_date, str):
                    inv_date = datetime.fromisoformat(inv_date.replace('/', '-'))
                inv_date_str = inv_date.strftime('%Y-%m-%d') if hasattr(inv_date, 'strftime') else str(inv_date)
                
                # Find bond
                bond = bond_lookup.get(deal_id)
                if not bond:
                    results['errors'].append(f"Row {row_num}: Bond '{deal_id}' not found. Create the bond first.")
                    results['failed'] += 1
                    continue
                
                # Find client by PAN
                client = client_by_pan.get(pan)
                if not client:
                    results['errors'].append(f"Row {row_num}: Client with PAN '{pan}' not found. Create the client first.")
                    results['failed'] += 1
                    continue
                
                # Check for duplicate
                existing = await db.trades.find_one({
                    "bond_id": bond['id'],
                    "client_id": client['id'],
                    "investment_date": inv_date_str,
                    "units": units
                })
                if existing:
                    results['errors'].append(f"Row {row_num}: Duplicate trade already exists")
                    results['failed'] += 1
                    continue
                
                # Check if enough units are available
                total_units = bond.get('total_units', 0)
                units_sold = bond.get('units_sold', 0)
                available_units = total_units - units_sold
                
                if units > available_units and total_units > 0:
                    results['errors'].append(
                        f"Row {row_num}: Not enough units available. "
                        f"Requested: {units}, Available: {available_units} "
                        f"(Total: {total_units}, Already Sold: {units_sold})"
                    )
                    results['failed'] += 1
                    continue
                
                # Validate investment amount against secondary calculator
                calc_result = calculate_secondary_market_price_and_units(
                    bond=bond,
                    investment_date_str=inv_date_str,
                    investment_amount=amount,
                    cutoff_days=bond.get('cutoff_days', 15)
                )
                
                expected_price_per_unit = calc_result.get('price_per_unit', 0)
                
                # Calculate expected total: round(price_per_unit × units) + ₹5 markup
                TOTAL_AMOUNT_MARKUP = 5.0
                base_amount = round(expected_price_per_unit * units)
                expected_total_amount = base_amount + TOTAL_AMOUNT_MARKUP
                amount_difference = abs(amount - expected_total_amount)
                
                # Tolerance: ₹10 per unit to handle calculation differences
                TOLERANCE_PER_UNIT = 10.0
                AMOUNT_TOLERANCE = TOLERANCE_PER_UNIT * units
                
                if expected_price_per_unit > 0 and amount_difference > AMOUNT_TOLERANCE:
                    results['errors'].append(
                        f"Row {row_num}: Investment amount mismatch. "
                        f"File amount: ₹{amount:,.2f}, Expected (₹{expected_price_per_unit:,.2f} × {units} + ₹5): ₹{expected_total_amount:,.2f}, "
                        f"Difference: ₹{amount_difference:,.2f} (tolerance: ₹{AMOUNT_TOLERANCE:.2f} for {units} units)"
                    )
                    results['failed'] += 1
                    continue
                
                # Use calculated price if available, otherwise derive from amount/units
                price_per_unit = expected_price_per_unit if expected_price_per_unit > 0 else (amount / units if units > 0 else 0)
                
                # Create trade with approved status (auto-approved)
                trade_id = str(uuid.uuid4())
                
                trade = {
                    "id": trade_id,
                    "bond_id": bond['id'],
                    "bond_name": bond.get('name', ''),
                    "bond_code": bond.get('bond_code', deal_id),
                    "client_id": client['id'],
                    "client_name": client.get('name', ''),
                    "client_pan": pan,
                    "units": units,
                    "investment_date": inv_date_str,
                    "calculated_price": price_per_unit,
                    "total_amount": amount,
                    "expected_amount_from_calculator": expected_total_amount,
                    "amount_difference": amount_difference,
                    "payment_reference": utr,
                    "status": "approved",  # Auto-approved
                    "utr_number": utr,
                    "is_historical": True,
                    "created_by": current_user['id'],
                    "created_by_name": current_user.get('name', 'System'),
                    "created_by_role": "broker",
                    "broker_notes": f"Historical import via bulk upload. Amount validated against secondary calculator (diff: ₹{amount_difference:.2f})",
                    "approved_by": current_user['id'],
                    "approved_at": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.trades.insert_one(trade)
                
                # Update bond units sold (in memory for subsequent rows in same upload)
                bond['units_sold'] = units_sold + units
                
                # Update bond units sold in database
                await db.bonds.update_one(
                    {"id": bond['id']},
                    {"$inc": {"units_sold": units}}
                )
                
                # Add to client's bond allocations
                allocation = {
                    "bond_id": bond['id'],
                    "bond_name": bond.get('name', ''),
                    "units_blocked": units,
                    "units_paid": units,
                    "status": "fully_paid",
                    "trade_id": trade_id,
                    "allocated_at": datetime.now(timezone.utc).isoformat()
                }
                await db.clients.update_one(
                    {"id": client['id']},
                    {"$push": {"bond_allocations": allocation}}
                )
                
                # Generate projected cashflows - these will appear in Holdings
                cashflows = generate_client_cashflows(trade, bond)
                
                # Check if bond has the required data to generate cashflows
                if not cashflows:
                    # Check why no cashflows were generated
                    has_cashflows_per_unit = bond.get('cashflows_per_unit', [])
                    has_interest_payments = bond.get('interest_payments', [])
                    has_principal_payments = bond.get('principal_payments', [])
                    
                    # Detailed debug info
                    debug_info = {
                        "bond_code": deal_id,
                        "investment_date": inv_date_str,
                        "units": units,
                        "cashflows_per_unit_count": len(has_cashflows_per_unit) if has_cashflows_per_unit else 0,
                        "interest_payments_count": len(has_interest_payments) if has_interest_payments else 0,
                        "principal_payments_count": len(has_principal_payments) if has_principal_payments else 0,
                        "bond_end_date": bond.get('end_date', 'N/A'),
                        "cutoff_days": bond.get('cutoff_days', 15)
                    }
                    
                    # Log for debugging
                    logger.warning(f"No cashflows generated for trade. Debug info: {debug_info}")
                    
                    if not has_cashflows_per_unit and not has_interest_payments:
                        results['errors'].append(
                            f"Row {row_num}: Trade created but NO CASHFLOWS generated. "
                            f"Bond '{deal_id}' has {len(has_cashflows_per_unit)} cashflows_per_unit entries. "
                            f"Investment date: {inv_date_str}, Bond end date: {bond.get('end_date', 'N/A')}. "
                            f"Ensure the bond template Sheet 4 (Cashflows Per Unit) has payment dates AFTER investment date + {bond.get('cutoff_days', 15)} days."
                        )
                    else:
                        # Has data but still no cashflows - likely all dates are before investment
                        results['errors'].append(
                            f"Row {row_num}: Trade created but cashflows filtered out. "
                            f"Investment date {inv_date_str} + cutoff {bond.get('cutoff_days', 15)} days = cutoff date. "
                            f"All {len(has_cashflows_per_unit)} payment dates in bond may be before this cutoff."
                        )
                    
                    # Mark in warnings
                    if 'warnings' not in results:
                        results['warnings'] = []
                    results['warnings'].append(debug_info)
                
                if cashflows:
                    today = datetime.now(timezone.utc).date()
                    for cf in cashflows:
                        cf['client_id'] = client['id']
                        cf['client_name'] = client.get('name', '')
                        cf['bond_id'] = bond['id']
                        cf['bond_name'] = bond.get('name', '')
                        cf['trade_id'] = trade_id
                        cf['reinvestment_tag'] = 'not_tagged'  # Will appear in untagged section
                        
                        # For historical imports: Mark past-dated cashflows as repaid
                        cf_date_str = cf.get('date', '')
                        if cf_date_str:
                            cf_date = datetime.fromisoformat(cf_date_str.split('T')[0]).date()
                            if cf_date < today:
                                cf['is_repaid'] = True
                                cf['repaid_at'] = datetime.now(timezone.utc).isoformat()
                                cf['repaid_actual_amount'] = cf.get('net_amount', 0)
                    
                    await db.holding_cashflows.insert_many(cashflows)
                    
                    # Track cashflows created
                    if 'cashflows_created' not in results:
                        results['cashflows_created'] = 0
                    results['cashflows_created'] += len(cashflows)
                
                results['success'] += 1
                results['investments_created'] += 1
                bonds_with_new_investments.add(bond['id'])
                
                results['created_trades'].append({
                    "trade_id": trade_id,
                    "bond_code": deal_id,
                    "client_pan": pan,
                    "client_name": client.get('name', ''),
                    "units": units,
                    "amount": amount,
                    "expected_amount": expected_total_amount,
                    "amount_difference": amount_difference,
                    "price_per_unit": price_per_unit,
                    "investment_date": inv_date_str,
                    "cashflows_generated": len(cashflows) if cashflows else 0,
                    "validation": "PASSED" if amount_difference <= AMOUNT_TOLERANCE else "WITHIN_TOLERANCE"
                })
                
            except Exception as e:
                results['errors'].append(f"Row {row_num}: {str(e)}")
                results['failed'] += 1
        
        # Check bond status - move to 'funded' ONLY when all units are utilized
        results['bonds_status_updated'] = []
        for bond_id in bonds_with_new_investments:
            # Re-fetch bond to get updated units_sold count
            updated_bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
            if updated_bond:
                total_units = updated_bond.get('total_units', 0)
                units_sold = updated_bond.get('units_sold', 0)
                available_units = total_units - units_sold
                
                # Update status based on utilization
                current_status = updated_bond.get('status', 'active')
                new_status = current_status
                
                if units_sold >= total_units and total_units > 0:
                    # All units utilized - move to funded
                    new_status = 'funded'
                elif units_sold > 0 and current_status == 'active':
                    # Partial investment - keep as active but track
                    new_status = 'active'
                
                if new_status != current_status:
                    await db.bonds.update_one(
                        {"id": bond_id},
                        {"$set": {"status": new_status}}
                    )
                
                results['bonds_status_updated'].append({
                    "bond_code": updated_bond.get('bond_code', bond_id),
                    "total_units": total_units,
                    "units_sold": units_sold,
                    "available_units": available_units,
                    "status": new_status,
                    "fully_funded": units_sold >= total_units
                })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing investment details upload: {str(e)}")
        results['errors'].append(f"Processing error: {str(e)}")
    
    return results


# ==================== BULK HISTORICAL TRADES UPLOAD ====================

@api_router.get("/bulk/template/historical-trades")
async def download_historical_trades_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk historical repayments upload (repayments only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Repayment Details (only sheet now - no investment details)
    ws_repayments = wb.active
    ws_repayments.title = "Repayment Details"
    
    header_font = Font(bold=True, color="FFFFFF")
    
    # Date of Investment is optional - helps match to specific trade when client has multiple investments in same bond
    rep_headers = ["Deal ID*", "Date of Investment (optional)", "Repayment Date*", "PAN*", "Principal", "Interest", "Gross Amount*", "TDS", "Net Amount*"]
    
    rep_header_fill = PatternFill(start_color="B45309", end_color="B45309", fill_type="solid")  # Etihad gold/amber
    
    for col, header in enumerate(rep_headers, 1):
        cell = ws_repayments.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = rep_header_fill
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_repayments.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample repayment data - showing prepayment flow with principal reduction
    rep_sample = [
        # Prepayment entries (principal only, no interest) - reduces balance
        ["CDNRE001", "2025-05-07", "2025-10-01", "ABCDE1234F", 945000, 0, 945000, 0, 945000],
        ["CDNRE001", "2025-05-07", "2025-11-05", "ABCDE1234F", 945000, 0, 945000, 0, 945000],
        ["CDNRE001", "2025-05-07", "2025-12-03", "ABCDE1234F", 945000, 0, 945000, 0, 945000],
        ["CDNRE001", "2025-05-07", "2026-01-07", "ABCDE1234F", 945000, 0, 945000, 0, 945000],
        # Maturity entry (remaining principal + accumulated interest)
        # System will auto-calculate this if not provided, based on prepayments
    ]
    for row_idx, row_data in enumerate(rep_sample, 2):
        for col, value in enumerate(row_data, 1):
            ws_repayments.cell(row=row_idx, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "═══════════════════════════════════════════════════════════════════",
        "       HISTORICAL REPAYMENTS UPLOAD - INSTRUCTIONS",
        "═══════════════════════════════════════════════════════════════════",
        "",
        "⚠️  PREREQUISITE: UPLOAD INVESTMENT DETAILS FIRST!",
        "────────────────────────────────────────────────────────────────────",
        "Before uploading repayments, you MUST:",
        "1. Create all bonds/deals in the system (Go to Opportunities > Create Bond)",
        "2. Create all clients in the system (Go to Client Management > Add Client)",
        "3. Upload investment details via 'Investment Details' tab in Bulk Upload",
        "4. The Deal ID in this file must match the Bond Code in the system",
        "",
        "═══════════════════════════════════════════════════════════════════",
        "REPAYMENT DETAILS SHEET",
        "═══════════════════════════════════════════════════════════════════",
        "Records actual repayments received by clients (interest/principal)",
        "Supports IRREGULAR PAYMENTS outside regular payment cycle!",
        "",
        "Required Fields:",
        "• Deal ID*: Bond code (must match existing bond)",
        "• Repayment Date*: When the repayment was made (YYYY-MM-DD)",
        "• PAN*: Client's PAN number",
        "• Gross Amount*: Total repayment before TDS",
        "• Net Amount*: Amount received after TDS",
        "",
        "Optional Fields:",
        "• Date of Investment: When the client invested (YYYY-MM-DD)",
        "  → Used with Deal ID to uniquely identify the trade",
        "  → IMPORTANT: Same client can have multiple investments in same bond",
        "• Principal: Principal portion of repayment",
        "  → If principal > 0 on a non-scheduled date = IRREGULAR PREPAYMENT",
        "  → System will auto-detect and process prepayments",
        "• Interest: Interest portion of repayment",
        "• TDS: Tax Deducted at Source",
        "",
        "═══════════════════════════════════════════════════════════════════",
        "PREPAYMENT CALCULATION (IMPORTANT!)",
        "═══════════════════════════════════════════════════════════════════",
        "When prepayments are uploaded, the system calculates:",
        "",
        "1. BALANCE PRINCIPAL after each prepayment",
        "   Balance = Original Principal - Sum of Prepayments",
        "",
        "2. INTEREST for each period using:",
        "   Interest = Balance Principal × Coupon Rate × Days / 365",
        "",
        "3. MATURITY PAYOUT = Remaining Principal + Accumulated Interest",
        "",
        "Example (135 units @ 100,000 face value, 18.73% coupon):",
        "   Original Principal: ₹13,500,000",
        "   Prepayment 1 (Oct): ₹945,000 → Balance: ₹12,555,000",
        "   Prepayment 2 (Nov): ₹945,000 → Balance: ₹11,610,000",
        "   Prepayment 3 (Dec): ₹945,000 → Balance: ₹10,665,000",
        "   Prepayment 4 (Jan): ₹945,000 → Balance: ₹9,720,000",
        "   Maturity (Apr): ₹9,720,000 + ₹3,547,590 (interest) = ₹13,267,590",
        "",
        "The 'Actual Cashflow' chart will show this flow automatically!",
        "",
        "═══════════════════════════════════════════════════════════════════",
        "NOTES",
        "═══════════════════════════════════════════════════════════════════",
        "• This upload is for REPAYMENT DATA ONLY",
        "• For investment data, use the 'Investment Details' tab in Bulk Upload",
        "• Duplicate repayments (same bond, client, date) will be skipped",
        "• Maturity entry is AUTO-CALCULATED if prepayments exist",
    ]
    
    for row_idx, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row_idx, column=1, value=text)
        if "═" in text or "PREREQUISITE" in text:
            cell.font = Font(bold=True)
    
    ws_instructions.column_dimensions['A'].width = 75
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=historical_repayments_template.xlsx"}
    )


@api_router.post("/bulk/historical-trades")
async def bulk_upload_historical_trades(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Bulk upload historical repayments only.
    Repayment Details - records actual payments for projected vs actuals comparison.
    For investment uploads, use /bulk/investment-details endpoint.
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload historical trades")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    
    results = {
        "success": 0,
        "failed": 0,
        "errors": [],
        "repayments_recorded": 0,
        "validation_summary": {
            "total_repayment_rows": 0
        }
    }
    
    # Get all bonds and clients for lookup
    all_bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    all_clients = await db.clients.find({}, {"_id": 0}).to_list(10000)
    
    # Create lookup dictionaries
    bond_lookup = {b.get('bond_code', '').strip().upper(): b for b in all_bonds if b.get('bond_code')}
    bond_by_id = {b['id']: b for b in all_bonds}
    client_by_pan = {c.get('pan_number', '').strip().upper(): c for c in all_clients if c.get('pan_number')}
    
    try:
        # Read Repayment Details sheet (first sheet or named sheet)
        try:
            df_repayments = pd.read_excel(io.BytesIO(content), sheet_name="Repayment Details")
        except Exception:
            # Fall back to first sheet
            df_repayments = pd.read_excel(io.BytesIO(content), sheet_name=0)
        
        df_repayments.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df_repayments.columns]
        
        if df_repayments is None or len(df_repayments) == 0:
            raise HTTPException(status_code=400, detail="No data found in the uploaded file. Please use 'Repayment Details' sheet.")
        
        # Process Repayment Details (Actuals)
        results['validation_summary']['total_repayment_rows'] = len(df_repayments)
        
        # Required columns (date_of_investment is OPTIONAL - used for matching to specific trade)
        required_rep_cols = ['deal_id', 'repayment_date', 'pan', 'gross_amount', 'net_amount']
        missing_cols = [col for col in required_rep_cols if col not in df_repayments.columns]
        if missing_cols:
            raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing_cols)}")
        
        for idx, row in df_repayments.iterrows():
            row_num = idx + 2
            try:
                if pd.isna(row.get('deal_id')) or pd.isna(row.get('pan')):
                    continue
                
                deal_id = str(row['deal_id']).strip().upper()
                pan = str(row['pan']).strip().upper()
                
                # Parse date of investment (OPTIONAL - for matching to specific trade)
                # Check both column names for backwards compatibility
                inv_date = row.get('date_of_investment') or row.get('date_of_investment_(optional)')
                inv_date_str = None
                if pd.notna(inv_date):
                    if isinstance(inv_date, str):
                        inv_date = datetime.fromisoformat(inv_date.replace('/', '-'))
                    inv_date_str = inv_date.strftime('%Y-%m-%d') if hasattr(inv_date, 'strftime') else str(inv_date)[:10]
                
                # Parse repayment date
                rep_date = row['repayment_date']
                if isinstance(rep_date, str):
                    rep_date = datetime.fromisoformat(rep_date.replace('/', '-'))
                rep_date_str = rep_date.strftime('%Y-%m-%d') if hasattr(rep_date, 'strftime') else str(rep_date)
                
                principal = float(row.get('principal', 0)) if pd.notna(row.get('principal')) else 0
                interest = float(row.get('interest', 0)) if pd.notna(row.get('interest')) else 0
                gross_amount = float(row['gross_amount'])
                tds = float(row.get('tds', 0)) if pd.notna(row.get('tds')) else 0
                net_amount = float(row['net_amount'])
                
                # Find bond
                bond = bond_lookup.get(deal_id)
                if not bond:
                    results['errors'].append(f"Repayment Row {row_num}: Bond '{deal_id}' not found")
                    results['failed'] += 1
                    continue
                
                # Find client
                client = client_by_pan.get(pan)
                if not client:
                    results['errors'].append(f"Repayment Row {row_num}: Client with PAN '{pan}' not found")
                    results['failed'] += 1
                    continue
                
                # Check for duplicate actual repayment
                existing = await db.actual_repayments.find_one({
                    "bond_id": bond['id'],
                    "client_id": client['id'],
                    "repayment_date": rep_date_str,
                    "net_amount": net_amount
                })
                if existing:
                    results['errors'].append(f"Repayment Row {row_num}: Duplicate repayment already recorded")
                    results['failed'] += 1
                    continue
                
                # Find matching trade for this repayment
                trade_query = {
                    "bond_id": bond['id'],
                    "client_id": client['id'],
                    "status": "approved"
                }
                if inv_date_str:
                    trade_query["investment_date"] = inv_date_str
                
                matching_trade = await db.trades.find_one(trade_query, {"_id": 0})
                
                # Store actual repayment
                actual_repayment = {
                    "id": str(uuid.uuid4()),
                    "bond_id": bond['id'],
                    "bond_name": bond['name'],
                    "bond_code": deal_id,
                    "client_id": client['id'],
                    "client_name": client['name'],
                    "client_pan": pan,
                    "investment_date": inv_date_str,  # For matching to specific trade
                    "repayment_date": rep_date_str,
                    "principal": principal,
                    "interest": interest,
                    "gross_amount": gross_amount,
                    "tds": tds,
                    "net_amount": net_amount,
                    "type": "actual",  # Mark as actual
                    "created_by": current_user['id'],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "is_historical": True,
                    "trade_id": matching_trade['id'] if matching_trade else None
                }
                
                await db.actual_repayments.insert_one(actual_repayment)
                results['repayments_recorded'] += 1
                results['success'] += 1
                
                # PREPAYMENT DETECTION AND PROCESSING
                # Check if this repayment contains a prepayment (unscheduled principal)
                if matching_trade and principal > 0:
                    # Get scheduled cashflows for this trade
                    scheduled_cfs = await db.holding_cashflows.find({
                        "trade_id": matching_trade['id']
                    }, {"_id": 0}).to_list(200)
                    
                    # Find if there's a scheduled cashflow for this repayment date
                    scheduled_principal_for_date = 0
                    matching_cf_id = None
                    for scf in scheduled_cfs:
                        scf_date = scf.get('date', '').split('T')[0]
                        if scf_date == rep_date_str:
                            scheduled_principal_for_date = scf.get('principal_component', 0)
                            matching_cf_id = scf.get('id')
                            break
                    
                    # Calculate excess principal (prepayment)
                    # If no scheduled payment on this date, entire principal is a prepayment
                    excess_principal = principal - scheduled_principal_for_date
                    
                    # Process as prepayment if:
                    # 1. There's excess principal beyond scheduled, OR
                    # 2. No scheduled cashflow exists for this date (irregular payment)
                    is_irregular_payment = (scheduled_principal_for_date == 0 and principal > 0)
                    is_excess_prepayment = (excess_principal > 0.01)
                    
                    if is_irregular_payment or is_excess_prepayment:
                        prepay_amount = principal if is_irregular_payment else excess_principal
                        
                        # Parse repayment date for prepayment processing
                        try:
                            prepay_date = datetime.strptime(rep_date_str, '%Y-%m-%d')
                        except:
                            prepay_date = datetime.now()
                        
                        # Process the prepayment
                        prepay_result = await process_bond_prepayment(
                            db_instance=db,
                            trade_id=matching_trade['id'],
                            prepayment_amount=prepay_amount,
                            prepayment_date=prepay_date,
                            source="historical_upload",
                            recorded_by=current_user['id'],
                            notes=f"{'Irregular payment' if is_irregular_payment else 'Excess prepayment'} from historical upload row {row_num}"
                        )
                        
                        if prepay_result.get('success'):
                            if 'prepayments_processed' not in results:
                                results['prepayments_processed'] = 0
                            results['prepayments_processed'] += 1
                            
                            # Track irregular payments separately
                            if is_irregular_payment:
                                if 'irregular_payments_detected' not in results:
                                    results['irregular_payments_detected'] = 0
                                results['irregular_payments_detected'] += 1
                            
                            if prepay_result.get('trade_closed'):
                                if 'trades_closed_by_prepayment' not in results:
                                    results['trades_closed_by_prepayment'] = []
                                results['trades_closed_by_prepayment'].append({
                                    "trade_id": matching_trade['id'],
                                    "client": client['name'],
                                    "bond": bond['name']
                                })
                        else:
                            results['errors'].append(
                                f"Repayment Row {row_num}: Prepayment detected (₹{prepay_amount:,.2f}) but processing failed: {prepay_result.get('errors', [])}"
                            )
                    
                    # Also create/update a cashflow record for this repayment if it doesn't exist
                    if is_irregular_payment:
                        # Create a new cashflow entry for this irregular payment
                        tds_calc = round(interest * 0.10, 2) if interest > 0 else 0
                        new_cf = {
                            "id": str(uuid.uuid4()),
                            "trade_id": matching_trade['id'],
                            "client_id": client['id'],
                            "bond_id": bond['id'],
                            "date": f"{rep_date_str}T00:00:00",
                            "principal_component": principal,
                            "interest_component": interest,
                            "tds_amount": tds if tds > 0 else tds_calc,
                            "gross_amount": gross_amount,
                            "net_amount": net_amount,
                            "is_repaid": True,
                            "repaid_date": rep_date_str,
                            "repaid_actual_amount": net_amount,
                            "is_prepaid": True,
                            "is_irregular": True,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "created_by": current_user['id'],
                            "source": "historical_upload"
                        }
                        await db.holding_cashflows.insert_one(new_cf)
                
            except Exception as e:
                results['errors'].append(f"Repayment Row {row_num}: {str(e)}")
                results['failed'] += 1
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing historical repayments upload: {str(e)}")
        results['errors'].append(f"Processing error: {str(e)}")
    
    return results


@api_router.post("/holdings/fix-historical-repayments")
async def fix_historical_repayments(current_user: dict = Depends(get_current_user)):
    """
    Fix existing historical cashflows by marking past-dated ones as repaid.
    This is a one-time fix for existing data that was uploaded before the auto-repaid logic was added.
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can run this fix")
    
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()
    
    # Find all cashflows that are past-dated but not marked as repaid
    past_cashflows = await db.holding_cashflows.find({
        "is_repaid": {"$ne": True}
    }, {"_id": 0, "id": 1, "date": 1, "net_amount": 1}).to_list(10000)
    
    updated_count = 0
    for cf in past_cashflows:
        try:
            cf_date_str = cf.get('date', '')
            if not cf_date_str:
                continue
            cf_date = datetime.fromisoformat(cf_date_str.split('T')[0]).date()
            
            if cf_date < today:
                await db.holding_cashflows.update_one(
                    {"id": cf['id']},
                    {"$set": {
                        "is_repaid": True,
                        "repaid_at": datetime.now(timezone.utc).isoformat(),
                        "repaid_actual_amount": cf.get('net_amount', 0)
                    }}
                )
                updated_count += 1
        except Exception as e:
            print(f"Error processing cashflow {cf.get('id')}: {e}")
            continue
    
    return {
        "message": f"Fixed {updated_count} historical cashflows",
        "total_checked": len(past_cashflows),
        "updated": updated_count
    }


def calculate_xnpv_price(
    face_value: float,
    investment_date: datetime,
    client_irr: float,
    cashflows: list,
    cutoff_days: int = 15
) -> dict:
    """
    Calculate bond price using Excel XNPV formula exactly.
    
    Formula: price_per_unit = face_value + XNPV(irr, cashflows_with_outflow, dates) / units
    
    Where XNPV includes:
    - Initial outflow at investment_date: -face_value
    - Future cashflows (interest + principal) that are NOT missed due to record date
    
    Args:
        face_value: Face value per unit
        investment_date: Date of investment
        client_irr: IRR as decimal (e.g., 0.115 for 11.5%)
        cashflows: List of dicts with 'date', 'interest_per_unit', 'principal_per_unit'
        cutoff_days: Record date is this many days before payment date (default 15)
    
    Returns:
        dict with price_per_unit, xnpv_value, accrued_interest, remaining_cashflows, etc.
    """
    result = {
        "face_value": face_value,
        "investment_date": investment_date.strftime('%Y-%m-%d'),
        "client_irr": client_irr,
        "cutoff_days": cutoff_days,
        "xnpv_value": 0.0,
        "price_per_unit": 0.0,
        "clean_price_pct": 0.0,
        "accrued_interest": 0.0,
        "accrued_interest_pct": 0.0,
        "dirty_price_pct": 0.0,
        "remaining_cashflows": [],
        "missed_cashflows": [],
        "last_ip_date": None,
        "next_ip_date": None,
    }
    
    if not cashflows:
        result["price_per_unit"] = face_value
        result["warning"] = "No cashflows provided"
        return result
    
    # Build XNPV cashflows list: [(date, amount), ...]
    # First entry is the initial outflow at investment date
    xnpv_flows = [(investment_date, -face_value)]
    
    # Find last and next IP dates for accrued interest calculation
    sorted_cashflows = sorted(cashflows, key=lambda x: x.get('date', ''))
    last_ip_date = None
    next_ip_date = None
    
    for cf in sorted_cashflows:
        cf_date_str = str(cf.get('date', '')).split('T')[0].split(' ')[0]
        if cf_date_str:
            try:
                cf_date = datetime.fromisoformat(cf_date_str)
                if cf_date <= investment_date:
                    last_ip_date = cf_date
                elif next_ip_date is None and cf_date > investment_date:
                    next_ip_date = cf_date
            except:
                pass
    
    result["last_ip_date"] = last_ip_date.strftime('%Y-%m-%d') if last_ip_date else None
    result["next_ip_date"] = next_ip_date.strftime('%Y-%m-%d') if next_ip_date else None
    
    # Process each cashflow
    for cf in sorted_cashflows:
        cf_date_str = str(cf.get('date', '')).split('T')[0].split(' ')[0]
        if not cf_date_str:
            continue
            
        try:
            cf_date = datetime.fromisoformat(cf_date_str)
        except:
            continue
        
        interest = cf.get('interest_per_unit', 0) or 0
        principal = cf.get('principal_per_unit', 0) or 0
        total_cf = interest + principal
        
        # Calculate record date
        record_date = cf_date - timedelta(days=cutoff_days)
        
        # Check if cashflow is missed (record date on or before investment date)
        if record_date <= investment_date:
            # Missed cashflow - set to 0 in XNPV
            xnpv_flows.append((cf_date, 0))
            result["missed_cashflows"].append({
                "date": cf_date_str,
                "record_date": record_date.strftime('%Y-%m-%d'),
                "interest": round(interest, 2),
                "principal": round(principal, 2),
                "total": round(total_cf, 2),
                "days_from_investment": (cf_date - investment_date).days,
            })
        else:
            # Include cashflow
            xnpv_flows.append((cf_date, total_cf))
            result["remaining_cashflows"].append({
                "date": cf_date_str,
                "record_date": record_date.strftime('%Y-%m-%d'),
                "interest": round(interest, 2),
                "principal": round(principal, 2),
                "total": round(total_cf, 2),
                "days_from_investment": (cf_date - investment_date).days,
            })
    
    # Calculate XNPV
    # XNPV = sum of PV of each cashflow, where PV = CF / (1 + rate)^(days/365)
    # First date is the valuation date (days = 0)
    xnpv_total = 0
    valuation_date = xnpv_flows[0][0]
    
    for cf_date, cf_amount in xnpv_flows:
        days = (cf_date - valuation_date).days
        if days == 0:
            pv = cf_amount
        else:
            discount_factor = (1 + client_irr) ** (days / 365)
            pv = cf_amount / discount_factor
        xnpv_total += pv
    
    result["xnpv_value"] = round(xnpv_total, 2)
    
    # Price per unit = face_value + XNPV
    price_per_unit = face_value + xnpv_total
    result["price_per_unit"] = round(price_per_unit, 2)
    
    # Calculate accrued interest
    # Accrued = FV * (investment_date - last_ip_date) * coupon_rate / 365
    # But if next_ip_date is the first payment (last_ip_date is None or same as next_ip_date),
    # then accrued is calculated from investment_date to next_ip_date (negative)
    
    # From the Excel: Accrued = FV_for_accrued * (investment_date - last_ip_date) * coupon_rate / 365
    # If investment_date < last_ip_date (next payment date stored as last_ip_date), accrued is negative
    
    if next_ip_date and last_ip_date:
        # Normal case: calculate accrued from last_ip_date to investment_date
        accrued_days = (investment_date - last_ip_date).days
        # Get coupon rate from first cashflow (assuming it has interest)
        coupon_rate = 0.14  # Default, should be passed or calculated from cashflows
        for cf in sorted_cashflows:
            int_amt = cf.get('interest_per_unit', 0)
            if int_amt and int_amt > 0:
                # Back-calculate coupon rate: interest = FV * days * rate / 365
                # This is approximate, better to pass coupon_rate explicitly
                break
    elif next_ip_date:
        # Investment is before first payment - accrued is negative (buyer pays less)
        accrued_days = (investment_date - next_ip_date).days  # Will be negative
    else:
        accrued_days = 0
    
    # For now, calculate as shown in Excel: E15 = FV * (inv_date - last_ip) * coupon / 365
    # But we need the coupon rate from somewhere
    
    # Calculate clean/dirty price percentages
    result["dirty_price_pct"] = round((price_per_unit / face_value) * 100, 4) if face_value else 0
    
    # Accrued interest percentage (from Excel E18)
    # This requires knowing when accrued was calculated from
    # For now, leave it for the calling function to set based on bond details
    
    return result


def calculate_secondary_market_price_and_units(bond: dict, investment_date_str: str, investment_amount: float = None, irr: float = None, cutoff_days: int = 15) -> dict:
    """
    Calculate secondary market price per unit and units for a given investment.
    Uses cashflows_per_unit for accurate calculation.
    
    The record date convention is used to determine missed cashflows:
    - Record date = Payment date - cutoff_days
    - If record_date <= investment_date, the payment is missed (goes to primary holder)
    
    Args:
        bond: Bond document with cashflows_per_unit
        investment_date_str: Date of investment (YYYY-MM-DD)
        investment_amount: Amount being invested (optional, for unit calculation)
        irr: IRR to use for discounting (optional, defaults to bond's secondary_irr)
        cutoff_days: Record date is this many days before payment date (default 15)
    
    Returns:
        dict with price_per_unit, calculated_units, remaining_cashflows, etc.
    """
    investment_date = datetime.fromisoformat(investment_date_str.split('T')[0].split(' ')[0])
    
    # Use provided IRR or bond's secondary IRR
    if irr is None:
        irr = bond.get('secondary_irr', bond.get('primary_irr', 12))
    irr_decimal = irr / 100
    
    # Get cashflows per unit - if empty, generate from interest_payments
    cashflows_per_unit = bond.get('cashflows_per_unit', [])
    
    if not cashflows_per_unit:
        # Generate cashflows_per_unit from interest_payments and principal_payments
        interest_payments = bond.get('interest_payments', [])
        principal_payments = bond.get('principal_payments', [])
        face_value = bond.get('face_value', bond.get('principal_amount', 100000))
        
        # Create a map of payment dates to cashflows
        cashflow_map = {}
        
        # Add interest payments (per unit)
        for ip in interest_payments:
            date = ip.get('date', '')
            if date:
                if date not in cashflow_map:
                    cashflow_map[date] = {'date': date, 'interest_per_unit': 0, 'principal_per_unit': 0}
                cashflow_map[date]['interest_per_unit'] += ip.get('amount', 0)
        
        # Add principal payments (per unit)
        for pp in principal_payments:
            date = pp.get('date', '')
            pct = pp.get('percentage', 0)
            if date and pct:
                principal_per_unit = face_value * (pct / 100)
                if date not in cashflow_map:
                    cashflow_map[date] = {'date': date, 'interest_per_unit': 0, 'principal_per_unit': 0}
                cashflow_map[date]['principal_per_unit'] += principal_per_unit
        
        # Sort by date
        cashflows_per_unit = sorted(cashflow_map.values(), key=lambda x: x['date'])
    
    result = {
        "investment_date": investment_date_str,
        "cutoff_days": cutoff_days,
        "irr_used": irr,
        "face_value_per_unit": bond.get('face_value', bond.get('principal_amount', 0) / max(bond.get('total_units', 1), 1)),
        "total_cashflows_in_bond": len(cashflows_per_unit),
        "remaining_cashflows": 0,
        "missed_cashflows": 0,
        "remaining_cashflows_detail": [],
        "missed_cashflows_detail": [],
        "total_remaining_interest_per_unit": 0,
        "total_remaining_principal_per_unit": 0,
        "total_remaining_cashflow_per_unit": 0,
        "total_missed_interest_per_unit": 0,
        "total_missed_principal_per_unit": 0,
        "present_value_per_unit": 0,
        "price_per_unit": 0,
        "calculated_units": 0,
        "investment_amount": investment_amount
    }
    
    if not cashflows_per_unit:
        # Fallback to face value if no cashflows defined
        result["price_per_unit"] = result["face_value_per_unit"]
        if investment_amount:
            result["calculated_units"] = round(investment_amount / result["price_per_unit"], 2)
        result["warning"] = "No cashflows_per_unit or interest_payments defined. Using face value."
        return result
    
    # Separate remaining and missed cashflows using RECORD DATE convention
    pv_total = 0
    
    for cf in cashflows_per_unit:
        cf_date_str = cf['date'].split('T')[0].split(' ')[0]
        cf_date = datetime.fromisoformat(cf_date_str)
        interest = cf.get('interest_per_unit', 0)
        principal = cf.get('principal_per_unit', 0)
        total_cf = interest + principal
        
        # Calculate record date (cutoff_days BEFORE payment date)
        record_date = cf_date - timedelta(days=cutoff_days)
        
        # Payment is missed if RECORD DATE is on or before the investment date
        # (meaning the investor would not be on the register for this payment)
        if record_date <= investment_date:
            # Missed cashflow - already paid/committed to primary holder
            result["missed_cashflows"] += 1
            result["total_missed_interest_per_unit"] += interest
            result["total_missed_principal_per_unit"] += principal
            result["missed_cashflows_detail"].append({
                "date": cf_date_str,
                "record_date": record_date.strftime('%Y-%m-%d'),
                "interest": round(interest, 2),
                "principal": round(principal, 2),
                "total": round(total_cf, 2),
                "status": "Paid to primary holder (record date passed)"
            })
        else:
            # Remaining cashflow - calculate PV from investment date
            days = (cf_date - investment_date).days
            years = days / 365
            discount_factor = 1 / ((1 + irr_decimal) ** years)
            pv = total_cf * discount_factor
            pv_total += pv
            
            result["remaining_cashflows"] += 1
            result["total_remaining_interest_per_unit"] += interest
            result["total_remaining_principal_per_unit"] += principal
            result["remaining_cashflows_detail"].append({
                "date": cf_date_str,
                "record_date": record_date.strftime('%Y-%m-%d'),
                "interest": round(interest, 2),
                "principal": round(principal, 2),
                "total": round(total_cf, 2),
                "days_from_investment": days,
                "discount_factor": round(discount_factor, 6),
                "present_value": round(pv, 2)
            })
    
    result["total_remaining_cashflow_per_unit"] = result["total_remaining_interest_per_unit"] + result["total_remaining_principal_per_unit"]
    result["present_value_per_unit"] = round(pv_total, 2)
    result["price_per_unit"] = round(pv_total, 2)  # No markup on price_per_unit
    
    # ₹5 markup is added to the TOTAL amount, not per unit
    TOTAL_AMOUNT_MARKUP = 5.0
    result["total_amount_markup"] = TOTAL_AMOUNT_MARKUP
    
    # Situation 1: If investment_amount provided, calculate units
    if investment_amount and pv_total > 0:
        result["calculated_units"] = round(investment_amount / pv_total, 4)
        
        # Calculate what the final amount should be for whole units
        whole_units = int(investment_amount / pv_total)
        base_amount = round(whole_units * pv_total)
        final_amount_with_markup = base_amount + TOTAL_AMOUNT_MARKUP
        
        result["whole_units"] = whole_units
        result["base_amount"] = base_amount  # price_per_unit × units (rounded)
        result["final_amount"] = round(final_amount_with_markup)  # base_amount + ₹5 markup
    
    # Situation 2: Show price bounds
    result["price_bounds"] = {
        "price_per_unit": round(pv_total, 2),
        "markup_on_total": TOTAL_AMOUNT_MARKUP,
        "note": "Final amount = round(price_per_unit × units) + ₹5"
    }
    
    # Calculate discount from face value
    if result["face_value_per_unit"] > 0:
        result["discount_from_face_value"] = round(result["face_value_per_unit"] - result["price_per_unit"], 2)
        result["discount_percentage"] = round((result["discount_from_face_value"] / result["face_value_per_unit"]) * 100, 2)
    
    return result


@api_router.post("/bonds/calculate-secondary-price")
async def calculate_secondary_price(
    bond_code: str,
    investment_date: str,
    investment_amount: float = None,
    irr: float = None,
    cutoff_days: int = 15,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate the secondary market price per unit and units for a given investment.
    
    This endpoint helps determine:
    - How many units a secondary buyer gets for their investment
    - What price per unit they're paying
    - Which cashflows they missed (paid to primary holder)
    - Which cashflows they will receive
    
    Args:
        bond_code: Bond code or ID
        investment_date: Date of investment (YYYY-MM-DD)
        investment_amount: Amount being invested (optional)
        irr: IRR for discounting (optional, defaults to bond's secondary_irr)
        cutoff_days: Payments within this many days after investment are missed (default 15)
    """
    # Find the bond
    bond = await db.bonds.find_one({"bond_code": bond_code.upper()}, {"_id": 0})
    if not bond:
        # Try by ID
        bond = await db.bonds.find_one({"id": bond_code}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail=f"Bond with code '{bond_code}' not found")
    
    if not bond.get('cashflows_per_unit'):
        raise HTTPException(
            status_code=400, 
            detail="Bond does not have cashflows_per_unit defined. Please upload bond with exact cashflow schedule."
        )
    
    result = calculate_secondary_market_price_and_units(
        bond=bond,
        investment_date_str=investment_date,
        investment_amount=investment_amount,
        irr=irr,
        cutoff_days=cutoff_days
    )
    
    result["bond_code"] = bond.get('bond_code')
    result["bond_name"] = bond.get('name')
    
    return result


class XNPVPriceRequest(BaseModel):
    """Request model for XNPV-based price calculation"""
    face_value: float = Field(..., description="Face value per unit")
    investment_date: str = Field(..., description="Investment date (YYYY-MM-DD)")
    client_irr: float = Field(..., description="Client IRR as percentage (e.g., 11.5)")
    coupon_rate: float = Field(..., description="Coupon rate as percentage (e.g., 14)")
    bond_start_date: str = Field(..., description="Bond start date (YYYY-MM-DD)")
    bond_end_date: str = Field(..., description="Bond maturity date (YYYY-MM-DD)")
    interest_frequency: str = Field(default="monthly", description="monthly, quarterly, semi-annual, annual")
    principal_payments: List[dict] = Field(default=[], description="List of {date: 'YYYY-MM-DD', percentage: float}")
    cutoff_days: int = Field(default=15, description="Record date is this many days before payment")


@api_router.post("/bonds/calculate-xnpv-price")
async def calculate_xnpv_price_endpoint(
    request: XNPVPriceRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate bond price using Excel XNPV formula exactly.
    
    This matches the BharatBond Excel calculation:
    - Price = face_value + XNPV(irr, cashflows, dates) 
    - Cashflows include initial outflow (-face_value) at investment date
    - Record date determines which payments are missed
    
    Example for bond with:
    - Face value: 100,000
    - Investment date: 2026-01-20
    - Client IRR: 11.5%
    - Coupon: 14%
    - Start: 2025-12-30, End: 2027-06-30
    - Monthly interest, 50% principal Mar 2027, 50% Jun 2027
    
    Expected result: 103,355.17
    """
    try:
        investment_date = datetime.fromisoformat(request.investment_date.split('T')[0])
        bond_start = datetime.fromisoformat(request.bond_start_date.split('T')[0])
        bond_end = datetime.fromisoformat(request.bond_end_date.split('T')[0])
        
        face_value = request.face_value
        coupon_rate = request.coupon_rate / 100
        client_irr = request.client_irr / 100
        
        # Generate cashflows schedule
        cashflows = []
        
        # Map of principal payment dates
        principal_map = {}
        for pp in request.principal_payments:
            pp_date = pp.get('date', '')
            pp_pct = pp.get('percentage', 0)
            if pp_date and pp_pct:
                principal_map[pp_date] = face_value * (pp_pct / 100)
        
        # Determine frequency in months
        freq_months = {
            "monthly": 1,
            "quarterly": 3,
            "semi-annual": 6,
            "annual": 12,
            "on_maturity": 0  # Special case
        }
        months = freq_months.get(request.interest_frequency.lower(), 1)
        
        # Generate payment dates
        # Key: Always use the ORIGINAL start day of month, not the previous payment date
        original_day = bond_start.day  # e.g., 30
        prev_date = bond_start
        balance = face_value
        month_counter = 0
        
        if months == 0:
            # On maturity - single payment at end
            days_in_period = (bond_end - bond_start).days
            interest = balance * coupon_rate * days_in_period / 365
            date_str = bond_end.strftime('%Y-%m-%d')
            principal = principal_map.get(date_str, balance)  # Default to full balance if not specified
            
            cashflows.append({
                "date": date_str,
                "interest_per_unit": interest,
                "principal_per_unit": principal,
                "days_in_period": days_in_period,
                "balance": balance
            })
        else:
            # Regular periodic payments
            while True:
                month_counter += months
                
                # Calculate target date keeping original day of month
                target_month = bond_start.month + month_counter
                target_year = bond_start.year + (target_month - 1) // 12
                target_month = ((target_month - 1) % 12) + 1
                
                # Get last day of target month
                last_day_of_month = monthrange(target_year, target_month)[1]
                
                # Use original day or last day if original doesn't exist in target month
                target_day = min(original_day, last_day_of_month)
                
                current_date = datetime(target_year, target_month, target_day)
                
                if current_date > bond_end:
                    # Final payment at maturity if not already covered
                    if prev_date < bond_end:
                        days_in_period = (bond_end - prev_date).days
                        interest = balance * coupon_rate * days_in_period / 365
                        date_str = bond_end.strftime('%Y-%m-%d')
                        principal = principal_map.get(date_str, 0)
                        
                        cashflows.append({
                            "date": date_str,
                            "interest_per_unit": interest,
                            "principal_per_unit": principal,
                            "days_in_period": days_in_period,
                            "balance": balance
                        })
                    break
                
                # Calculate interest for this period
                days_in_period = (current_date - prev_date).days
                interest = balance * coupon_rate * days_in_period / 365
                
                # Check for principal payment on this date
                date_str = current_date.strftime('%Y-%m-%d')
                principal = principal_map.get(date_str, 0)
                
                cashflows.append({
                    "date": date_str,
                    "interest_per_unit": interest,
                    "principal_per_unit": principal,
                    "days_in_period": days_in_period,
                    "balance": balance
                })
                
                # Update balance after principal payment
                if principal > 0:
                    balance -= principal
                
                prev_date = current_date
                
                if current_date >= bond_end:
                    break
        
        # Calculate XNPV price
        result = calculate_xnpv_price(
            face_value=face_value,
            investment_date=investment_date,
            client_irr=client_irr,
            cashflows=cashflows,
            cutoff_days=request.cutoff_days
        )
        
        # Add additional context
        result["coupon_rate"] = request.coupon_rate
        result["bond_start_date"] = request.bond_start_date
        result["bond_end_date"] = request.bond_end_date
        result["interest_frequency"] = request.interest_frequency
        result["principal_payments_input"] = request.principal_payments
        result["generated_cashflows"] = cashflows
        
        # Calculate accrued interest based on Excel formula
        # E15 = FV * (investment_date - last_ip_date) * coupon_rate / 365
        if result.get("last_ip_date"):
            last_ip = datetime.fromisoformat(result["last_ip_date"])
            accrued_days = (investment_date - last_ip).days
            accrued_interest = face_value * accrued_days * coupon_rate / 365
            result["accrued_interest"] = round(accrued_interest, 2)
            result["accrued_interest_pct"] = round(accrued_interest / face_value * 100, 4)
        elif result.get("next_ip_date"):
            # Investment before first payment - calculate from investment to next IP
            next_ip = datetime.fromisoformat(result["next_ip_date"])
            accrued_days = (investment_date - next_ip).days  # Negative
            accrued_interest = face_value * accrued_days * coupon_rate / 365
            result["accrued_interest"] = round(accrued_interest, 2)
            result["accrued_interest_pct"] = round(accrued_interest / face_value * 100, 4)
        
        # Clean price = Dirty price - Accrued interest (in percentage terms)
        result["clean_price_pct"] = round(result["dirty_price_pct"] - result.get("accrued_interest_pct", 0), 4)
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Calculation error: {str(e)}")


class BondPriceCalculationRequest(BaseModel):
    """
    Request model for bond price calculation.
    Matches the Excel 'Final Bond Calculation' format.
    """
    face_value: float = Field(..., description="Face value per unit (e.g., 500000)")
    coupon_rate: float = Field(default=0, description="Coupon rate as decimal (e.g., 0.125 for 12.5%). Optional if interest_amount provided.")
    client_irr: float = Field(..., description="Client IRR as decimal (e.g., 0.11 for 11%)")
    bond_start_date: str = Field(..., description="Bond start date (YYYY-MM-DD)")
    investment_date: str = Field(..., description="Investment date (YYYY-MM-DD)")
    bond_maturity_date: str = Field(..., description="Bond maturity date (YYYY-MM-DD)")
    principal_repayment_type: str = Field(default="equal_monthly", description="equal_monthly, at_maturity, custom")
    custom_principal_payments: List[dict] = Field(default=[], description="For custom: [{date, percentage}]")
    cutoff_days: int = Field(default=15, description="Record date cutoff in days")
    payment_day: Optional[int] = Field(default=None, description="Day of month for payments (defaults to start date day)")
    interest_amount: Optional[float] = Field(default=None, description="For bullet bonds: total interest amount from cashflow file (overrides coupon calculation)")
    cashflows: Optional[List[dict]] = Field(default=None, description="Pre-defined cashflows: [{date, principal, interest}]")


@api_router.post("/bonds/calculate-price")
async def calculate_bond_price(
    request: BondPriceCalculationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate bond price per unit using discounted cash flow method.
    
    Formula (from Excel):
    - Generate all payment dates from start to maturity
    - For each payment: Principal + Interest = Total Payout
    - Interest = Balance × Days × Coupon / 365
    - Discounted CF = IF(days_from_investment > cutoff_days, Total / (1 + IRR)^(days/365), 0)
    - Price = Sum of all Discounted CFs
    
    Example (from Excel):
    - Face Value: 500,000
    - Coupon: 12.5%
    - Client IRR: 11%
    - Start: 2025-03-24, Investment: 2025-05-13, Maturity: 2026-09-24
    - Equal monthly principal repayment
    - Expected Price: 449,082.99
    """
    try:
        # Parse dates
        bond_start = datetime.fromisoformat(request.bond_start_date.split('T')[0])
        investment_date = datetime.fromisoformat(request.investment_date.split('T')[0])
        bond_maturity = datetime.fromisoformat(request.bond_maturity_date.split('T')[0])
        
        face_value = request.face_value
        coupon_rate = request.coupon_rate
        client_irr = request.client_irr
        cutoff_days = request.cutoff_days
        payment_day = request.payment_day or bond_start.day
        
        # If pre-defined cashflows are provided, use them directly
        if request.cashflows:
            total_price = 0
            total_principal = 0
            total_interest = 0
            processed_cashflows = []
            
            for cf in request.cashflows:
                cf_date = datetime.fromisoformat(cf.get('date', '').split('T')[0])
                principal = cf.get('principal', 0) or 0
                interest = cf.get('interest', 0) or 0
                total_payout = principal + interest
                
                days_from_investment = (cf_date - investment_date).days
                
                if days_from_investment > cutoff_days:
                    discount_factor = (1 + client_irr) ** (days_from_investment / 365)
                    discounted_cf = total_payout / discount_factor
                else:
                    discounted_cf = 0
                
                total_price += discounted_cf
                total_principal += principal
                total_interest += interest
                
                processed_cashflows.append({
                    "date": cf_date.strftime('%Y-%m-%d'),
                    "principal": round(principal, 2),
                    "interest": round(interest, 2),
                    "total_payout": round(total_payout, 2),
                    "days_from_investment": days_from_investment,
                    "discounted_cf": round(discounted_cf, 2),
                    "included": days_from_investment > cutoff_days
                })
            
            return {
                "price_per_unit": round(total_price, 2),
                "face_value": face_value,
                "client_irr": client_irr,
                "bond_start_date": request.bond_start_date,
                "investment_date": request.investment_date,
                "bond_maturity_date": request.bond_maturity_date,
                "principal_repayment_type": "from_cashflows",
                "cutoff_days": cutoff_days,
                "num_payments": len(processed_cashflows),
                "total_principal": round(total_principal, 2),
                "total_interest": round(total_interest, 2),
                "total_payout": round(total_principal + total_interest, 2),
                "cashflows": processed_cashflows
            }
        
        # Handle at_maturity (bullet bond) separately - only one payment at maturity
        if request.principal_repayment_type == "at_maturity":
            # For bullet bonds: single payment at maturity with all interest + principal
            total_days = (bond_maturity - bond_start).days
            
            # Use provided interest_amount if available, otherwise calculate
            if request.interest_amount is not None:
                total_interest = request.interest_amount
            else:
                total_interest = face_value * coupon_rate * total_days / 365
            
            total_payout = face_value + total_interest
            
            days_from_investment = (bond_maturity - investment_date).days
            
            if days_from_investment > cutoff_days:
                discount_factor = (1 + client_irr) ** (days_from_investment / 365)
                price_per_unit = total_payout / discount_factor
            else:
                price_per_unit = 0
            
            return {
                "price_per_unit": round(price_per_unit, 2),
                "face_value": face_value,
                "coupon_rate": coupon_rate,
                "client_irr": client_irr,
                "interest_amount_used": round(total_interest, 2),
                "bond_start_date": request.bond_start_date,
                "investment_date": request.investment_date,
                "bond_maturity_date": request.bond_maturity_date,
                "principal_repayment_type": request.principal_repayment_type,
                "cutoff_days": cutoff_days,
                "num_payments": 1,
                "total_principal": face_value,
                "total_interest": round(total_interest, 2),
                "total_payout": round(total_payout, 2),
                "days_to_maturity": days_from_investment,
                "total_bond_days": total_days,
                "cashflows": [{
                    "date": bond_maturity.strftime('%Y-%m-%d'),
                    "days_in_period": total_days,
                    "principal": face_value,
                    "balance": face_value,
                    "interest": round(total_interest, 2),
                    "total_payout": round(total_payout, 2),
                    "days_from_investment": days_from_investment,
                    "discounted_cf": round(price_per_unit, 2),
                    "included": days_from_investment > cutoff_days
                }]
            }
        
        # Generate payment dates (monthly on the payment_day) for non-bullet bonds
        payment_dates = []
        current = bond_start
        while current <= bond_maturity:
            # Move to next month
            month = current.month + 1
            year = current.year
            if month > 12:
                month = 1
                year += 1
            
            # Use payment_day, but handle months with fewer days
            last_day = monthrange(year, month)[1]
            day = min(payment_day, last_day)
            next_date = datetime(year, month, day)
            
            if next_date <= bond_maturity:
                payment_dates.append(next_date)
            
            current = next_date
            
            # Safety check to prevent infinite loop
            if len(payment_dates) > 100:
                break
        
        # Ensure maturity is included if it's a payment date
        if bond_maturity not in payment_dates and bond_maturity > bond_start:
            payment_dates.append(bond_maturity)
            payment_dates.sort()
        
        num_payments = len(payment_dates)
        
        # Determine principal repayment per payment
        if request.principal_repayment_type == "equal_monthly":
            principal_per_payment = face_value / num_payments
            principal_schedule = {d.strftime('%Y-%m-%d'): principal_per_payment for d in payment_dates}
        elif request.principal_repayment_type == "at_maturity":
            principal_schedule = {bond_maturity.strftime('%Y-%m-%d'): face_value}
        else:  # custom
            principal_schedule = {}
            for pp in request.custom_principal_payments:
                pp_date = pp.get('date', '')
                pp_pct = pp.get('percentage', 0)
                if pp_date and pp_pct:
                    principal_schedule[pp_date] = face_value * (pp_pct / 100)
        
        # Calculate cashflows
        cashflows = []
        balance = face_value
        prev_date = bond_start
        total_price = 0
        total_principal = 0
        total_interest = 0
        
        for pay_date in payment_dates:
            days_in_period = (pay_date - prev_date).days
            interest = balance * days_in_period * coupon_rate / 365
            principal = principal_schedule.get(pay_date.strftime('%Y-%m-%d'), 0)
            total_payout = principal + interest
            
            days_from_investment = (pay_date - investment_date).days
            
            # Apply cutoff: if days_from_investment > cutoff_days, include the cashflow
            if days_from_investment > cutoff_days:
                discount_factor = (1 + client_irr) ** (days_from_investment / 365)
                discounted_cf = total_payout / discount_factor
            else:
                discounted_cf = 0
            
            total_price += discounted_cf
            total_principal += principal
            total_interest += interest
            
            cashflows.append({
                "date": pay_date.strftime('%Y-%m-%d'),
                "days_in_period": days_in_period,
                "principal": round(principal, 2),
                "balance": round(balance, 2),
                "interest": round(interest, 2),
                "total_payout": round(total_payout, 2),
                "days_from_investment": days_from_investment,
                "discounted_cf": round(discounted_cf, 2),
                "included": days_from_investment > cutoff_days
            })
            
            balance -= principal
            prev_date = pay_date
        
        return {
            "price_per_unit": round(total_price, 2),
            "face_value": face_value,
            "coupon_rate": coupon_rate,
            "client_irr": client_irr,
            "bond_start_date": request.bond_start_date,
            "investment_date": request.investment_date,
            "bond_maturity_date": request.bond_maturity_date,
            "principal_repayment_type": request.principal_repayment_type,
            "cutoff_days": cutoff_days,
            "num_payments": num_payments,
            "total_principal": round(total_principal, 2),
            "total_interest": round(total_interest, 2),
            "total_payout": round(total_principal + total_interest, 2),
            "cashflows": cashflows
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Calculation error: {str(e)}")


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    color: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


@api_router.put("/partners/{partner_id}")
async def update_partner(partner_id: str, partner_update: PartnerUpdate, current_user: dict = Depends(get_current_user)):
    """Update a sub-broker partner (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update partners")
    
    # Check if partner exists and belongs to this broker
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Build update dict with only provided fields
    update_data = {}
    for field in ["name", "email", "mobile", "color", "address_line1", "address_line2", "city", "state", "pincode"]:
        value = getattr(partner_update, field)
        if value is not None:
            update_data[field] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Update partner record
    await db.partners.update_one({"id": partner_id}, {"$set": update_data})
    
    # Also update user record if name, email, or phone changed
    user_update = {}
    if "name" in update_data:
        user_update["name"] = update_data["name"]
    if "email" in update_data:
        user_update["email"] = update_data["email"]
    if "mobile" in update_data:
        user_update["phone"] = update_data["mobile"]
    
    if user_update:
        await db.users.update_one({"id": partner_id}, {"$set": user_update})
    
    # Return updated partner
    updated_partner = await db.partners.find_one({"id": partner_id}, {"_id": 0})
    return updated_partner


# ==================== CLIENT MANAGEMENT ====================

class ClientCreate(BaseModel):
    # Basic Details (Required for all)
    name: str
    email: str
    mobile: str
    
    # Identity & Residency
    country_of_residency: str  # Country dropdown with UAE & India on top
    passport_type: str  # "indian" or "foreign"
    
    # For Indian Passport holders
    pan_number: Optional[str] = None  # Required if passport_type == "indian"
    passport_number: Optional[str] = None  # Optional for Indian, Required for Foreign
    
    # For UAE residents
    emirates_id: Optional[str] = None  # Required if country_of_residency == "United Arab Emirates"
    emirates_id_expiry: Optional[str] = None  # Expiry date for Emirates ID
    
    # Passport Details (Required for Real Estate opportunity)
    passport_valid_from: Optional[str] = None
    passport_valid_until: Optional[str] = None
    passport_country_of_issue: Optional[str] = None
    
    # Opportunities Selection (array of: "bonds", "real_estate", "gift_city")
    opportunities: List[str] = []  # Indian: bonds, real_estate | Foreign: real_estate, gift_city
    
    # For Bonds opportunity (Indian passport holders only)
    ucc_list: Optional[List[str]] = None  # Max 5, unique across system
    demat_account_no: Optional[str] = None
    
    # Bank Details - Indian Bank (Required for Bonds - Indian passport holders)
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    branch: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_type: Optional[str] = None  # Savings, Current for residents; NRE, NRO, Savings, Current for NRIs
    
    # Bank Details - International Bank (Required for NRIs and Foreign passport holders)
    intl_bank_name: Optional[str] = None
    intl_account_number: Optional[str] = None
    intl_iban: Optional[str] = None
    intl_swift_code: Optional[str] = None
    
    # Additional Personal Details
    occupation: Optional[str] = None
    date_of_birth: Optional[str] = None
    father_husband_name: Optional[str] = None
    
    # Address Details
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None  # Can be different from country_of_residency
    pincode: Optional[str] = None
    
    # Nominee Details
    nominee_name: Optional[str] = None
    nominee_dob: Optional[str] = None
    nominee_mobile: Optional[str] = None
    nominee_relationship: Optional[str] = None
    
    # Linked Sub-broker (optional at creation)
    linked_subbroker_id: Optional[str] = None


class ClientUpdate(BaseModel):
    # Basic Details
    name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    
    # Identity & Residency
    country_of_residency: Optional[str] = None
    passport_type: Optional[str] = None  # "indian" or "foreign"
    pan_number: Optional[str] = None
    passport_number: Optional[str] = None
    emirates_id: Optional[str] = None
    emirates_id_expiry: Optional[str] = None
    
    # Passport Details
    passport_valid_from: Optional[str] = None
    passport_valid_until: Optional[str] = None
    passport_country_of_issue: Optional[str] = None
    
    # Opportunities
    opportunities: Optional[List[str]] = None
    
    # For Bonds
    ucc_list: Optional[List[str]] = None
    demat_account_no: Optional[str] = None
    
    # Bank Details - Indian Bank
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    branch: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_type: Optional[str] = None
    
    # Bank Details - International Bank
    intl_bank_name: Optional[str] = None
    intl_account_number: Optional[str] = None
    intl_iban: Optional[str] = None
    intl_swift_code: Optional[str] = None
    
    # Additional Personal Details
    occupation: Optional[str] = None
    date_of_birth: Optional[str] = None
    father_husband_name: Optional[str] = None
    
    # Address Details
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    
    # Nominee Details
    nominee_name: Optional[str] = None
    nominee_dob: Optional[str] = None
    nominee_mobile: Optional[str] = None
    nominee_relationship: Optional[str] = None
    
    # Sub-broker link
    linked_subbroker_id: Optional[str] = None


class ClientBondAllocation(BaseModel):
    bond_id: str
    units_blocked: int
    units_paid: int = 0
    status: str = "blocked"  # blocked, partial_paid, fully_paid


# Helper function to validate PAN format
def is_valid_pan_format(pan: str) -> bool:
    """Check if PAN follows the format: 5 letters + 4 digits + 1 letter"""
    import re
    if not pan or len(pan) != 10:
        return False
    pattern = r'^[A-Z]{5}[0-9]{4}[A-Z]$'
    return bool(re.match(pattern, pan.upper()))


@api_router.post("/clients")
async def create_client(client_data: ClientCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Create a new client (brokers and sub-brokers)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can create clients")
    
    # Validate passport type and required fields based on selection
    if client_data.passport_type not in ['indian', 'foreign']:
        raise HTTPException(status_code=400, detail="Passport type must be 'indian' or 'foreign'")
    
    # Determine the photo_id (login ID)
    if client_data.passport_type == 'indian':
        if not client_data.pan_number:
            raise HTTPException(status_code=400, detail="PAN number is required for Indian passport holders")
        photo_id = client_data.pan_number.upper()
        
        # Validate opportunities for Indian passport holders
        valid_opportunities = ['bonds', 'real_estate']
        for opp in client_data.opportunities:
            if opp not in valid_opportunities:
                raise HTTPException(status_code=400, detail=f"Indian passport holders can only select: {valid_opportunities}")
        
        # If bonds selected, validate bank details
        if 'bonds' in client_data.opportunities:
            if not client_data.bank_name or not client_data.account_number or not client_data.ifsc_code:
                raise HTTPException(status_code=400, detail="Bank details (Bank Name, Account Number, IFSC) are required for Bond investments")
    else:
        # Foreign passport holder
        if not client_data.passport_number:
            raise HTTPException(status_code=400, detail="Passport number is required for foreign passport holders")
        photo_id = client_data.passport_number.upper()
        
        # Validate opportunities for foreign passport holders
        valid_opportunities = ['real_estate', 'gift_city']
        for opp in client_data.opportunities:
            if opp not in valid_opportunities:
                raise HTTPException(status_code=400, detail=f"Foreign passport holders can only select: {valid_opportunities}")
    
    # Validate Emirates ID for UAE residents
    if client_data.country_of_residency and client_data.country_of_residency.lower() in ['united arab emirates', 'uae']:
        if not client_data.emirates_id:
            raise HTTPException(status_code=400, detail="Emirates ID is required for UAE residents")
    
    # Validate passport details if real_estate is selected
    if 'real_estate' in client_data.opportunities:
        if not client_data.passport_valid_from or not client_data.passport_valid_until or not client_data.passport_country_of_issue:
            raise HTTPException(status_code=400, detail="Passport validity details (Valid From, Valid Until, Country of Issue) are required for Real Estate investments")
    
    # Validate UCC list (optional - only relevant for bonds)
    ucc_list = []
    if 'bonds' in client_data.opportunities and client_data.ucc_list and len(client_data.ucc_list) > 0:
        if len(client_data.ucc_list) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 UCCs allowed per client")
        
        # Clean and uppercase UCCs
        ucc_list = [ucc.strip().upper() for ucc in client_data.ucc_list if ucc.strip()]
        
        # Check for duplicate UCCs in the submitted list
        if len(ucc_list) != len(set(ucc_list)):
            raise HTTPException(status_code=400, detail="Duplicate UCCs are not allowed")
        
        # Check if any UCC already exists in the system (UCCs must be unique across all clients)
        for ucc in ucc_list:
            existing_ucc = await db.clients.find_one({"ucc_list": ucc})
            if existing_ucc:
                raise HTTPException(status_code=400, detail=f"UCC '{ucc}' is already assigned to another client")
    
    # Check if client with same photo_id already exists
    existing = await db.clients.find_one({"photo_id": photo_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"Client with this {'PAN' if client_data.passport_type == 'indian' else 'Passport Number'} already exists")
    
    # Also check legacy pan_number field for backwards compatibility
    if client_data.pan_number:
        existing_pan = await db.clients.find_one({"pan_number": client_data.pan_number.upper()})
        if existing_pan:
            raise HTTPException(status_code=400, detail="Client with this PAN already exists")
    
    # Check if user with same photo_id already exists
    # ROLE OVERLAP HANDLING: If PAN exists as sub-broker, allow creating client with PAN+1
    existing_user = await db.users.find_one({"pan": photo_id})
    original_photo_id = photo_id  # Keep original PAN for reference
    is_role_overlap = False
    
    if existing_user:
        # Check if existing user is a sub-broker - allow role overlap
        if existing_user.get('role') == 'sub_broker':
            # Create client login with PAN + "1" suffix
            photo_id = f"{original_photo_id}1"
            is_role_overlap = True
            
            # Verify the modified photo_id doesn't exist
            existing_modified = await db.users.find_one({"pan": photo_id})
            if existing_modified:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Client login for this sub-broker already exists. Login ID: {photo_id}"
                )
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"User with this {'PAN' if client_data.passport_type == 'indian' else 'Passport Number'} already exists"
            )
    
    client_dict = client_data.model_dump()
    client_id = str(uuid.uuid4())
    client_dict['id'] = client_id
    client_dict['photo_id'] = photo_id  # The login ID (PAN for Indian, Passport for Foreign, or PAN+1 for role overlap)
    client_dict['original_pan'] = original_photo_id  # Store original PAN for reference
    client_dict['is_role_overlap'] = is_role_overlap  # Track if this is a sub-broker who is also a client
    if client_dict.get('pan_number'):
        client_dict['pan_number'] = client_dict['pan_number'].upper()
    if client_dict.get('passport_number'):
        client_dict['passport_number'] = client_dict['passport_number'].upper()
    client_dict['ucc_list'] = ucc_list  # Store cleaned UCC list (can be empty)
    client_dict['created_by'] = current_user['id']
    client_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    client_dict['bond_allocations'] = []
    client_dict['verification_status'] = 'pending'  # pending, verified
    client_dict['verification_token'] = str(uuid.uuid4())
    client_dict['is_active'] = True  # Clients are active by default
    
    # Track document expiry notifications
    if client_dict.get('passport_valid_until'):
        client_dict['passport_expiry_notified'] = False
    
    # If sub-broker is creating, auto-link the client to them
    if current_user['role'] == 'sub_broker':
        client_dict['linked_subbroker_id'] = current_user['id']
    
    # Generate default credentials (client will change on first login)
    default_password = "kinntegra123"  # Standard default password
    default_pin = "1234"  # Standard default PIN
    
    # Create user account for client
    user_id = str(uuid.uuid4())
    user_data = {
        "id": user_id,
        "pan": photo_id,  # Login ID is the photo_id (PAN or Passport Number)
        "name": client_data.name,
        "email": client_data.email,
        "phone": client_data.mobile,
        "password_hash": get_password_hash(default_password),
        "pin_hash": get_password_hash(default_pin),
        "role": "client",
        "is_active": True,  # Clients are active by default
        "client_id": client_id,
        "broker_id": current_user['id'],
        "passport_type": client_data.passport_type,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Link user to client
    client_dict['user_id'] = user_id
    
    await db.users.insert_one(user_data)
    await db.clients.insert_one(client_dict)
    
    # Return without _id
    if '_id' in client_dict:
        del client_dict['_id']
    
    # Include default credentials in response (for display to broker)
    client_dict['default_password'] = default_password
    client_dict['default_pin'] = default_pin
    
    # Send welcome email in background (if email is provided)
    if client_data.email:
        background_tasks.add_task(
            send_welcome_email_client,
            client_name=client_data.name,
            client_email=client_data.email,
            pan=photo_id,  # Use photo_id as login ID
            password=default_password,
            pin=default_pin,
            broker_name=current_user.get('name', 'Your Broker')
        )
    
    return client_dict


@api_router.get("/clients")
async def get_clients(current_user: dict = Depends(get_current_user)):
    """Get all clients (brokers see all, sub-brokers see only linked clients)"""
    if current_user['role'] == 'broker':
        clients = await db.clients.find({"created_by": current_user['id']}, {"_id": 0}).to_list(1000)
    else:
        # Sub-brokers see only clients linked to them
        clients = await db.clients.find({"linked_subbroker_id": current_user['id']}, {"_id": 0}).to_list(1000)
    
    return clients


@api_router.get("/clients/dashboard/expiring-documents")
async def get_expiring_documents(current_user: dict = Depends(get_current_user)):
    """Get clients with documents expiring within 3 months (for dashboard notifications)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from datetime import timedelta
    
    # Calculate date 3 months from now
    three_months_from_now = datetime.now(timezone.utc) + timedelta(days=90)
    today = datetime.now(timezone.utc)
    
    # Build query based on role
    if current_user['role'] == 'broker':
        base_query = {"created_by": current_user['id']}
    else:
        base_query = {"linked_subbroker_id": current_user['id']}
    
    # Find clients with passport expiring within 3 months
    clients = await db.clients.find(base_query, {"_id": 0}).to_list(1000)
    
    expiring_documents = []
    for client in clients:
        passport_expiry = client.get('passport_valid_until')
        if passport_expiry:
            try:
                expiry_date = datetime.fromisoformat(passport_expiry.replace('Z', '+00:00')) if isinstance(passport_expiry, str) else passport_expiry
                if today <= expiry_date <= three_months_from_now:
                    days_until_expiry = (expiry_date - today).days
                    expiring_documents.append({
                        "client_id": client.get('id'),
                        "client_name": client.get('name'),
                        "document_type": "passport",
                        "expiry_date": passport_expiry,
                        "days_until_expiry": days_until_expiry,
                        "photo_id": client.get('photo_id') or client.get('pan_number')
                    })
            except (ValueError, TypeError):
                pass
    
    # Sort by days until expiry (most urgent first)
    expiring_documents.sort(key=lambda x: x['days_until_expiry'])
    
    return {"expiring_documents": expiring_documents, "count": len(expiring_documents)}


@api_router.get("/clients/dashboard/invalid-pan")
async def get_invalid_pan_clients(current_user: dict = Depends(get_current_user)):
    """Get clients with invalid PAN format (for dashboard alerts)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build query based on role
    if current_user['role'] == 'broker':
        base_query = {"created_by": current_user['id']}
    else:
        base_query = {"linked_subbroker_id": current_user['id']}
    
    # Only check Indian passport holders
    base_query['passport_type'] = 'indian'
    
    clients = await db.clients.find(base_query, {"_id": 0}).to_list(1000)
    
    invalid_pan_clients = []
    for client in clients:
        pan = client.get('pan_number') or client.get('photo_id')
        if pan and not is_valid_pan_format(pan):
            invalid_pan_clients.append({
                "client_id": client.get('id'),
                "client_name": client.get('name'),
                "pan_number": pan,
                "email": client.get('email'),
                "mobile": client.get('mobile')
            })
    
    return {"invalid_pan_clients": invalid_pan_clients, "count": len(invalid_pan_clients)}


@api_router.post("/clients/migrate-to-new-schema")
async def migrate_clients_to_new_schema(current_user: dict = Depends(get_current_user)):
    """Migrate existing clients to the new schema (Indian passport holders by default)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can run migrations")
    
    # Get all clients created by this broker that don't have the new fields
    clients = await db.clients.find({
        "created_by": current_user['id'],
        "passport_type": {"$exists": False}
    }).to_list(10000)
    
    migrated_count = 0
    invalid_pan_count = 0
    
    for client in clients:
        pan = client.get('pan_number', '')
        
        # Set new fields for existing clients (assume Indian passport holders)
        update_fields = {
            "passport_type": "indian",
            "country_of_residency": client.get('country', 'India') or 'India',
            "photo_id": pan.upper() if pan else None,
            "opportunities": ["bonds", "real_estate"],  # Default to both for existing
        }
        
        # Check if PAN is valid
        if not is_valid_pan_format(pan):
            invalid_pan_count += 1
        
        await db.clients.update_one(
            {"id": client['id']},
            {"$set": update_fields}
        )
        
        # Also update the user record
        if client.get('user_id'):
            await db.users.update_one(
                {"id": client['user_id']},
                {"$set": {"passport_type": "indian"}}
            )
        
        migrated_count += 1
    
    return {
        "message": f"Migration complete",
        "migrated_clients": migrated_count,
        "invalid_pan_clients": invalid_pan_count
    }


@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific client - accessible by broker (creator), sub-broker (linked), or the client themselves"""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access based on role
    if current_user['role'] == 'broker':
        # Broker can access clients they created
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] == 'client':
        # Client can access their own profile data
        if client.get('user_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Sub-broker can access linked clients
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return client


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, client_update: ClientUpdate, current_user: dict = Depends(get_current_user)):
    """Update a client (brokers and sub-brokers)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can update clients")
    
    # Brokers can update any client they created, sub-brokers can update linked clients
    if current_user['role'] == 'broker':
        client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    else:  # sub_broker
        client = await db.clients.find_one({"id": client_id, "linked_subbroker_id": current_user['id']})
    
    if not client:
        raise HTTPException(status_code=404, detail="Client not found or access denied")
    
    update_data = {k: v for k, v in client_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Validate UCC list if provided
    if 'ucc_list' in update_data:
        ucc_list = update_data['ucc_list']
        
        if not ucc_list or len(ucc_list) == 0:
            raise HTTPException(status_code=400, detail="At least one UCC is required")
        
        if len(ucc_list) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 UCCs allowed per client")
        
        # Clean and uppercase UCCs
        ucc_list = [ucc.strip().upper() for ucc in ucc_list if ucc.strip()]
        
        if len(ucc_list) == 0:
            raise HTTPException(status_code=400, detail="At least one valid UCC is required")
        
        # Check for duplicate UCCs in the submitted list
        if len(ucc_list) != len(set(ucc_list)):
            raise HTTPException(status_code=400, detail="Duplicate UCCs are not allowed")
        
        # Check if any UCC already exists in the system (excluding current client)
        for ucc in ucc_list:
            existing_ucc = await db.clients.find_one({"ucc_list": ucc, "id": {"$ne": client_id}})
            if existing_ucc:
                raise HTTPException(status_code=400, detail=f"UCC '{ucc}' is already assigned to another client")
        
        update_data['ucc_list'] = ucc_list
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    
    updated_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return updated_client


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Hard delete a client (brokers only) - removes from both clients and users collections"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check if client has any confirmed trades
    trades = await db.trades.find({"client_id": client_id, "status": "approved"}).to_list(1)
    
    if trades:
        # Cannot hard delete - client has trades
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete client with confirmed trades. Use 'Deactivate' instead to disable the account."
        )
    
    # Hard delete - remove from both collections to allow PAN reuse
    pan_number = client.get('pan_number')
    
    # Delete from clients collection
    await db.clients.delete_one({"id": client_id})
    
    # Also delete from users collection to allow recreation with same PAN
    if pan_number:
        await db.users.delete_one({"pan": pan_number})
    
    return {"message": "Client deleted successfully. PAN can now be reused.", "soft_delete": False}


@api_router.get("/clients/{client_id}/details")
async def get_client_details(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get full client details for editing (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can view client details")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    return client


@api_router.post("/clients/{client_id}/reactivate")
async def reactivate_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Reactivate an inactive client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can reactivate clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Update clients collection
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"is_active": True}, "$unset": {"deactivated_at": ""}}
    )
    
    # ALSO update users collection (this is where login check happens)
    await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {"is_active": True}, "$unset": {"deactivated_at": ""}}
    )
    
    return {"message": "Client reactivated successfully"}


@api_router.post("/clients/{client_id}/sync-activation")
async def sync_client_activation(client_id: str, current_user: dict = Depends(get_current_user)):
    """Sync the activation status between clients and users collections"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can sync client activation")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get client's is_active status
    client_active = client.get('is_active', True) and not client.get('deactivated_at')
    
    # Update users collection to match
    result = await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {"is_active": client_active}}
    )
    
    if result.matched_count == 0:
        return {"message": "No user account found for this client", "synced": False}
    
    return {
        "message": "Activation synced successfully",
        "synced": True,
        "is_active": client_active
    }


@api_router.post("/clients/{client_id}/resend-credentials")
async def resend_client_credentials(client_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Resend login credentials to client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can resend credentials")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Generate new password and PIN
    new_password = client['pan_number'][-4:] + str(uuid.uuid4().hex[:4])
    new_pin = str(uuid.uuid4().int)[:4]
    
    # Update user credentials
    await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {
            "password_hash": get_password_hash(new_password),
            "pin_hash": get_password_hash(new_pin)
        }}
    )
    
    # Try to send email (may fail if SMTP not configured)
    try:
        background_tasks.add_task(
            send_credentials_email,
            email=client['email'],
            name=client['name'],
            pan=client['pan_number'],
            password=new_password,
            pin=new_pin
        )
        email_sent = True
    except Exception as e:
        logger.error(f"Failed to send credentials email: {e}")
        email_sent = False
    
    return {
        "message": "Credentials reset successfully",
        "email_sent": email_sent,
        "credentials": {
            "pan": client['pan_number'],
            "password": new_password,
            "pin": new_pin,
            "email": client['email'],
            "name": client['name']
        }
    }


@api_router.post("/clients/{client_id}/reset-password")
async def reset_client_password(client_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Reset client password (brokers only) - generates a new password"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can reset passwords")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Generate new password
    new_password = client['pan_number'][-4:] + str(uuid.uuid4().hex[:4])
    
    # Update user password
    await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {"password_hash": get_password_hash(new_password)}}
    )
    
    # Try to send email
    try:
        background_tasks.add_task(
            send_password_reset_email,
            email=client['email'],
            name=client['name'],
            new_password=new_password
        )
        email_sent = True
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")
        email_sent = False
    
    return {
        "message": "Password reset successfully",
        "email_sent": email_sent,
        "new_password": new_password
    }


@api_router.post("/clients/{client_id}/deactivate")
async def deactivate_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Deactivate a client (soft delete - brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can deactivate clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Also deactivate the user account
    await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Client deactivated successfully"}


@api_router.post("/clients/{client_id}/link-subbroker")
async def link_client_to_subbroker(client_id: str, subbroker_id: str, current_user: dict = Depends(get_current_user)):
    """Link a client to a sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can link clients")
    
    # Verify client exists and belongs to broker
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Verify sub-broker exists and belongs to broker
    partner = await db.partners.find_one({"id": subbroker_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Sub-broker not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"linked_subbroker_id": subbroker_id}}
    )
    
    return {"message": f"Client linked to {partner['name']}"}


@api_router.post("/clients/{client_id}/unlink-subbroker")
async def unlink_client_from_subbroker(client_id: str, current_user: dict = Depends(get_current_user)):
    """Unlink a client from their sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can unlink clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"linked_subbroker_id": None}}
    )
    
    return {"message": "Client unlinked from sub-broker"}


@api_router.post("/clients/{client_id}/allocate-bond")
async def allocate_bond_to_client(client_id: str, allocation: ClientBondAllocation, current_user: dict = Depends(get_current_user)):
    """Allocate a bond to a client with units blocked/paid"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can allocate bonds")
    
    # Verify client
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Verify bond and check available units
    bond = await db.bonds.find_one({"id": allocation.bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    units_available = total_units - units_sold
    
    if allocation.units_blocked > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Check if client already has allocation for this bond
    existing_allocations = client.get('bond_allocations', [])
    for i, alloc in enumerate(existing_allocations):
        if alloc['bond_id'] == allocation.bond_id:
            # Update existing allocation
            existing_allocations[i] = {
                "bond_id": allocation.bond_id,
                "bond_name": bond['name'],
                "units_blocked": allocation.units_blocked,
                "units_paid": allocation.units_paid,
                "status": allocation.status,
                "allocated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.clients.update_one(
                {"id": client_id},
                {"$set": {"bond_allocations": existing_allocations}}
            )
            return {"message": "Bond allocation updated"}
    
    # Add new allocation
    new_allocation = {
        "bond_id": allocation.bond_id,
        "bond_name": bond['name'],
        "units_blocked": allocation.units_blocked,
        "units_paid": allocation.units_paid,
        "status": allocation.status,
        "allocated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.clients.update_one(
        {"id": client_id},
        {"$push": {"bond_allocations": new_allocation}}
    )
    
    # Update bond's units_sold if units are paid
    if allocation.units_paid > 0:
        await db.bonds.update_one(
            {"id": allocation.bond_id},
            {"$inc": {"units_sold": allocation.units_paid}}
        )
    
    return {"message": "Bond allocated to client", "allocation": new_allocation}


@api_router.put("/clients/{client_id}/allocations/{bond_id}")
async def update_bond_allocation(client_id: str, bond_id: str, units_paid: int, current_user: dict = Depends(get_current_user)):
    """Update the paid units for a client's bond allocation"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update allocations")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    allocations = client.get('bond_allocations', [])
    found = False
    old_units_paid = 0
    
    for i, alloc in enumerate(allocations):
        if alloc['bond_id'] == bond_id:
            old_units_paid = alloc.get('units_paid', 0)
            allocations[i]['units_paid'] = units_paid
            allocations[i]['status'] = 'fully_paid' if units_paid >= alloc['units_blocked'] else ('partial_paid' if units_paid > 0 else 'blocked')
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail="Bond allocation not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"bond_allocations": allocations}}
    )
    
    # Update bond's units_sold with the difference
    units_diff = units_paid - old_units_paid
    if units_diff != 0:
        await db.bonds.update_one(
            {"id": bond_id},
            {"$inc": {"units_sold": units_diff}}
        )
    
    return {"message": "Allocation updated", "units_paid": units_paid}


@api_router.delete("/clients/{client_id}/allocations/{bond_id}")
async def remove_bond_allocation(client_id: str, bond_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a bond allocation from a client"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can remove allocations")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    allocations = client.get('bond_allocations', [])
    units_paid_to_return = 0
    
    for alloc in allocations:
        if alloc['bond_id'] == bond_id:
            units_paid_to_return = alloc.get('units_paid', 0)
            break
    
    await db.clients.update_one(
        {"id": client_id},
        {"$pull": {"bond_allocations": {"bond_id": bond_id}}}
    )
    
    # Return paid units to bond's available pool
    if units_paid_to_return > 0:
        await db.bonds.update_one(
            {"id": bond_id},
            {"$inc": {"units_sold": -units_paid_to_return}}
        )
    
    return {"message": "Bond allocation removed"}


@api_router.get("/clients/{client_id}")
async def get_client_details(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed client information including KYC details"""
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access based on role
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Sub-broker can only access linked clients
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return client


# ==================== END CLIENT MANAGEMENT ====================


# ==================== BULK UPLOAD ====================

class BulkUploadResult(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: List[dict]
    created_clients: List[dict]


@api_router.post("/clients/bulk-upload")
async def bulk_upload_clients(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Bulk upload clients from Excel file.
    Expected columns from the investor list Excel:
    - Name, Pan Number, Contact Number, Email Address, Type (entity type)
    - Address1, Address2, City, State, Country, Pincode
    - Bank Account Number, Account Holder Name, IFSC
    - Father / Husband's Name, Occupation, Date of Birth
    - Nominee Name, Nominee Mobile Number, Relationship With Nominee, Nominee Date of Birth
    - Demat Account, Registration Date (as expiry date)
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload clients")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")
    
    try:
        # Read the Excel file
        contents = await file.read()
        wb = load_workbook(filename=io.BytesIO(contents), data_only=True)
        ws = wb.active
        
        # Get headers from first row
        headers = []
        for cell in ws[1]:
            headers.append(str(cell.value).strip() if cell.value else "")
        
        # Column mapping from Excel to our schema
        column_map = {
            'Name': 'name',
            'Pan Number': 'pan_number',
            'Contact Number': 'mobile',
            'Email Address': 'email',
            'Type': 'entity_type',
            'Address1': 'address_line1',
            'Address2': 'address_line2',
            'City': 'city',
            'State': 'state',
            'Country': 'country',
            'Pincode': 'pincode',
            'Bank Account Number': 'account_number',
            'Account Holder Name': 'account_holder_name',
            'IFSC': 'ifsc_code',
            'Father / Husband\'s Name': 'father_husband_name',
            'Occupation': 'occupation',
            'Date of Birth': 'date_of_birth',
            'Nominee Name': 'nominee_name',
            'Nominee Mobile Number': 'nominee_mobile',
            'Relationship With Nominee': 'nominee_relationship',
            'Nominee Date of Birth': 'nominee_dob',
            'Demat Account': 'demat_account',
            'Registration Date': 'registration_date',
            'Investor ID': 'investor_id',
            'Partner Code': 'partner_code',
            'Investor Status': 'investor_status',
            'Invested Amount (in ₹)': 'invested_amount',
        }
        
        # Find column indices
        col_indices = {}
        for i, header in enumerate(headers):
            for excel_col, db_field in column_map.items():
                if header.lower().strip() == excel_col.lower().strip():
                    col_indices[db_field] = i
                    break
        
        results = {
            "total_rows": 0,
            "successful": 0,
            "failed": 0,
            "errors": [],
            "created_clients": []
        }
        
        # Process each row (starting from row 2)
        for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not any(row):  # Skip empty rows
                continue
            
            results["total_rows"] += 1
            
            try:
                # Extract data from row
                def get_value(field_name):
                    if field_name in col_indices:
                        val = row[col_indices[field_name]]
                        if val is not None:
                            return str(val).strip()
                    return None
                
                name = get_value('name')
                pan = get_value('pan_number')
                
                # Skip placeholder/test data
                if not name or not pan:
                    results["failed"] += 1
                    results["errors"].append({
                        "row": row_num,
                        "error": "Missing required fields (Name or PAN)"
                    })
                    continue
                
                # Skip obvious test data
                if 'test' in name.lower() or 'service test' in name.lower():
                    results["failed"] += 1
                    results["errors"].append({
                        "row": row_num,
                        "error": f"Skipped test data: {name}"
                    })
                    continue
                
                # Check if client with same PAN already exists
                existing = await db.clients.find_one({"pan_number": pan.upper()})
                if existing:
                    results["failed"] += 1
                    results["errors"].append({
                        "row": row_num,
                        "error": f"Client with PAN {pan} already exists"
                    })
                    continue
                
                # Parse mobile number - clean it
                mobile = get_value('mobile')
                if mobile:
                    mobile = mobile.replace(' ', '').strip()
                
                # Parse pincode - clean it
                pincode = get_value('pincode')
                if pincode and pincode.startswith('IN'):
                    pincode = None  # Invalid format
                
                # Parse date of birth
                dob = get_value('date_of_birth')
                if dob and isinstance(dob, datetime):
                    dob = dob.strftime('%Y-%m-%d')
                
                # Parse nominee DOB
                nominee_dob = get_value('nominee_dob')
                if nominee_dob and isinstance(nominee_dob, datetime):
                    nominee_dob = nominee_dob.strftime('%Y-%m-%d')
                
                # Lookup sub-broker by partner code
                partner_code = get_value('partner_code')
                linked_subbroker_id = None
                linked_subbroker_name = None
                
                if partner_code:
                    # Find the sub-broker/partner with this code under the current broker
                    partner = await db.partners.find_one({
                        "partner_code": partner_code,
                        "created_by": current_user['id']
                    })
                    if partner:
                        linked_subbroker_id = partner['id']
                        linked_subbroker_name = partner['name']
                
                # Create client document
                client_id = str(uuid.uuid4())
                client_dict = {
                    "id": client_id,
                    "name": name,
                    "pan_number": pan.upper(),
                    "email": get_value('email'),
                    "mobile": mobile,
                    "entity_type": get_value('entity_type') or "Indian Citizen",
                    "address_line1": get_value('address_line1'),
                    "address_line2": get_value('address_line2'),
                    "city": get_value('city'),
                    "state": get_value('state'),
                    "country": get_value('country') or "India",
                    "pincode": pincode,
                    "account_number": get_value('account_number'),
                    "account_holder_name": get_value('account_holder_name'),
                    "ifsc_code": get_value('ifsc_code'),
                    "bank_name": None,  # Not in Excel
                    "father_husband_name": get_value('father_husband_name'),
                    "occupation": get_value('occupation'),
                    "date_of_birth": dob,
                    "nominee_name": get_value('nominee_name'),
                    "nominee_mobile": get_value('nominee_mobile'),
                    "nominee_relationship": get_value('nominee_relationship'),
                    "nominee_dob": nominee_dob,
                    "demat_account": get_value('demat_account'),
                    "investor_id": get_value('investor_id'),
                    "investor_status": get_value('investor_status'),
                    "registration_date": get_value('registration_date'),
                    "linked_subbroker_id": linked_subbroker_id,
                    "created_by": current_user['id'],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "bond_allocations": [],
                    "is_active": True,
                    "verification_status": 'pending',
                    "verification_token": str(uuid.uuid4()),
                    "source": "bulk_upload"
                }
                
                # Create user account for client
                user_id = str(uuid.uuid4())
                default_password = pan.upper()[-4:] + "1234"
                default_pin = "1234"
                
                user_data = {
                    "id": user_id,
                    "pan": pan.upper(),
                    "name": name,
                    "email": get_value('email'),
                    "phone": mobile,
                    "password_hash": get_password_hash(default_password),
                    "pin_hash": get_password_hash(default_pin),
                    "role": "client",
                    "is_active": False,  # Activated after verification
                    "client_id": client_id,
                    "broker_id": current_user['id'],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                client_dict['user_id'] = user_id
                
                # Check if user with same PAN already exists
                existing_user = await db.users.find_one({"pan": pan.upper()})
                if not existing_user:
                    await db.users.insert_one(user_data)
                
                await db.clients.insert_one(client_dict)
                
                results["successful"] += 1
                results["created_clients"].append({
                    "name": name,
                    "pan": pan.upper(),
                    "id": client_id,
                    "linked_subbroker": linked_subbroker_name
                })
                
            except Exception as e:
                results["failed"] += 1
                results["errors"].append({
                    "row": row_num,
                    "error": str(e)
                })
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@api_router.get("/clients/bulk-upload/template")
async def get_bulk_upload_template(current_user: dict = Depends(get_current_user)):
    """Download a template Excel file for bulk client upload"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Client Upload Template"
    
    # Headers matching the expected format - Partner Code added for sub-broker linking
    headers = [
        "Name", "Pan Number", "UCC", "Contact Number", "Email Address", "Type",
        "Partner Code",  # Sub-broker partner code for auto-linking
        "Father / Husband's Name", "Occupation", "Date of Birth",
        "Address1", "Address2", "City", "State", "Country", "Pincode",
        "Bank Account Number", "Account Holder Name", "IFSC",
        "Demat Account",
        "Nominee Name", "Nominee Mobile Number", "Relationship With Nominee", "Nominee Date of Birth"
    ]
    
    # Add headers
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center")
    
    # Add sample row
    sample_data = [
        "John Doe", "ABCDE1234F", "UCC123456", "+91 9876543210", "john@example.com", "Indian Citizen",
        "SB001",  # Sample partner code
        "Father Name", "Business", "1990-01-15",
        "123 Main Street", "Apt 4B", "Mumbai", "Maharashtra", "India", "400001",
        "1234567890123", "John Doe", "HDFC0001234",
        "IN30123456789012",
        "Jane Doe", "9876543210", "Spouse", "1992-05-20"
    ]
    
    for col, value in enumerate(sample_data, 1):
        ws.cell(row=2, column=col, value=value)
    
    # Adjust column widths
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 18
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=client_upload_template.xlsx"}
    )


# ==================== END BULK UPLOAD ====================


# ==================== TRADE MANAGEMENT ====================

class TradeCreate(BaseModel):
    bond_id: str
    client_id: Optional[str] = None  # Optional for clients (backend uses their client_id)
    units: int
    investment_date: str
    calculated_price: float
    total_amount: Optional[float] = None
    payment_reference: Optional[str] = None
    payment_notes: Optional[str] = None
    payment_proof_filename: Optional[str] = None
    payment_proof_url: Optional[str] = None
    record_future_cashflows: bool = False  # Flag to record future cashflows after verification


class TradeUpdate(BaseModel):
    status: str  # approved, rejected
    broker_notes: Optional[str] = None


@api_router.post("/trades")
async def create_trade(trade_data: TradeCreate, current_user: dict = Depends(get_current_user)):
    """Create a trade request (broker or sub-broker can create)"""
    
    # Verify bond exists and has available units
    bond = await db.bonds.find_one({"id": trade_data.bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    units_available = total_units - units_sold
    
    if trade_data.units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Verify client exists
    client = await db.clients.find_one({"id": trade_data.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access to client
    if current_user['role'] == 'sub_broker':
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="You can only create trades for your linked clients")
    
    # Determine if auto-approve (broker creates) or pending (sub-broker creates)
    status = "approved" if current_user['role'] == 'broker' else "pending"
    
    trade_dict = {
        "id": str(uuid.uuid4()),
        "bond_id": trade_data.bond_id,
        "bond_name": bond['name'],
        "client_id": trade_data.client_id,
        "client_name": client['name'],
        "client_pan": client['pan_number'],
        "units": trade_data.units,
        "investment_date": trade_data.investment_date,
        "calculated_price": trade_data.calculated_price,
        "total_amount": trade_data.calculated_price * trade_data.units,
        "payment_reference": trade_data.payment_reference,
        "payment_notes": trade_data.payment_notes,
        "payment_proof_filename": trade_data.payment_proof_filename,
        "payment_proof_url": trade_data.payment_proof_url,
        "record_future_cashflows": trade_data.record_future_cashflows,
        "status": status,
        "created_by": current_user['id'],
        "created_by_name": current_user.get('name', 'Unknown'),
        "created_by_role": current_user['role'],
        "broker_notes": None,
        "approved_by": current_user['id'] if status == "approved" else None,
        "approved_at": datetime.now(timezone.utc).isoformat() if status == "approved" else None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.trades.insert_one(trade_dict)
    
    # If auto-approved (broker created), update bond units
    if status == "approved":
        await db.bonds.update_one(
            {"id": trade_data.bond_id},
            {"$inc": {"units_sold": trade_data.units}}
        )
        
        # Also add to client's bond allocations
        allocation = {
            "bond_id": trade_data.bond_id,
            "bond_name": bond['name'],
            "units_blocked": trade_data.units,
            "units_paid": trade_data.units,
            "status": "fully_paid",
            "trade_id": trade_dict['id'],
            "allocated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clients.update_one(
            {"id": trade_data.client_id},
            {"$push": {"bond_allocations": allocation}}
        )
        
        # Record future cashflows for the client (reinvestment/retag option)
        if trade_data.record_future_cashflows and bond.get('cashflows_per_unit'):
            investment_date = datetime.fromisoformat(trade_data.investment_date)
            cutoff_days = bond.get('cutoff_days', 15)
            
            future_cashflows = []
            for cf in bond['cashflows_per_unit']:
                cf_date = datetime.fromisoformat(str(cf.get('date', '')).split('T')[0].split(' ')[0])
                days_from_investment = (cf_date - investment_date).days
                
                # Only record cashflows beyond cutoff (buyer receives these)
                if days_from_investment > cutoff_days:
                    interest = cf.get('interest', cf.get('interest_per_unit', 0)) or 0
                    principal = cf.get('principal', cf.get('principal_per_unit', 0)) or 0
                    
                    future_cashflows.append({
                        "id": str(uuid.uuid4()),
                        "date": cf.get('date'),
                        "interest_amount": round(interest * trade_data.units, 2),
                        "principal_amount": round(principal * trade_data.units, 2),
                        "total_amount": round((interest + principal) * trade_data.units, 2),
                        "status": "pending",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
            
            # Store future cashflows in client's record under reinvestment tag
            if future_cashflows:
                client_cashflow_record = {
                    "id": str(uuid.uuid4()),
                    "trade_id": trade_dict['id'],
                    "bond_id": trade_data.bond_id,
                    "bond_name": bond['name'],
                    "units": trade_data.units,
                    "investment_date": trade_data.investment_date,
                    "cashflows": future_cashflows,
                    "total_expected_interest": sum(cf['interest_amount'] for cf in future_cashflows),
                    "total_expected_principal": sum(cf['principal_amount'] for cf in future_cashflows),
                    "tag": "reinvestment",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.clients.update_one(
                    {"id": trade_data.client_id},
                    {"$push": {"bond_cashflow_records": client_cashflow_record}}
                )
    
    if '_id' in trade_dict:
        del trade_dict['_id']
    
    return trade_dict


@api_router.get("/trades")
async def get_trades(status: Optional[str] = None, client_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get trades - brokers see all, sub-brokers see only their own"""
    
    query = {}
    
    if current_user['role'] == 'broker':
        # Brokers see all trades
        pass
    elif current_user['role'] == 'client':
        # Clients see only their own trades
        client = await db.clients.find_one({"user_id": current_user['id']})
        if client:
            query["client_id"] = client['id']
    else:
        # Sub-brokers see only trades they created
        query["created_by"] = current_user['id']
    
    if status:
        query["status"] = status
    
    if client_id:
        query["client_id"] = client_id
    
    trades = await db.trades.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return trades


@api_router.get("/trades/pending")
async def get_pending_trades(current_user: dict = Depends(get_current_user)):
    """Get pending trades for broker verification"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can view pending trades")
    
    trades = await db.trades.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return trades


@api_router.get("/trades/{trade_id}")
async def get_trade(trade_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific trade"""
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Check access
    if current_user['role'] != 'broker' and trade['created_by'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return trade


@api_router.put("/trades/{trade_id}/verify")
async def verify_trade(trade_id: str, update: TradeUpdate, current_user: dict = Depends(get_current_user)):
    """Approve or reject a trade (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can verify trades")
    
    trade = await db.trades.find_one({"id": trade_id})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade['status'] != 'pending':
        raise HTTPException(status_code=400, detail="Trade is not pending verification")
    
    if update.status not in ['approved', 'rejected']:
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")
    
    # Update trade status
    await db.trades.update_one(
        {"id": trade_id},
        {"$set": {
            "status": update.status,
            "broker_notes": update.broker_notes,
            "approved_by": current_user['id'],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If approved, update bond units and client allocation
    if update.status == 'approved':
        # Update bond units sold
        await db.bonds.update_one(
            {"id": trade['bond_id']},
            {"$inc": {"units_sold": trade['units']}}
        )
        
        # Add to client's bond allocations
        bond = await db.bonds.find_one({"id": trade['bond_id']})
        allocation = {
            "bond_id": trade['bond_id'],
            "bond_name": trade['bond_name'],
            "units_blocked": trade['units'],
            "units_paid": trade['units'],
            "status": "fully_paid",
            "trade_id": trade_id,
            "allocated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clients.update_one(
            {"id": trade['client_id']},
            {"$push": {"bond_allocations": allocation}}
        )
        
        # Record future cashflows for the client (reinvestment/retag option) if flagged
        if trade.get('record_future_cashflows') and bond and bond.get('cashflows_per_unit'):
            investment_date = datetime.fromisoformat(trade['investment_date'])
            cutoff_days = bond.get('cutoff_days', 15)
            
            future_cashflows = []
            for cf in bond['cashflows_per_unit']:
                cf_date = datetime.fromisoformat(str(cf.get('date', '')).split('T')[0].split(' ')[0])
                days_from_investment = (cf_date - investment_date).days
                
                # Only record cashflows beyond cutoff (buyer receives these)
                if days_from_investment > cutoff_days:
                    interest = cf.get('interest', cf.get('interest_per_unit', 0)) or 0
                    principal = cf.get('principal', cf.get('principal_per_unit', 0)) or 0
                    
                    future_cashflows.append({
                        "id": str(uuid.uuid4()),
                        "date": cf.get('date'),
                        "interest_amount": round(interest * trade['units'], 2),
                        "principal_amount": round(principal * trade['units'], 2),
                        "total_amount": round((interest + principal) * trade['units'], 2),
                        "status": "pending",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
            
            # Store future cashflows in client's record under reinvestment tag
            if future_cashflows:
                client_cashflow_record = {
                    "id": str(uuid.uuid4()),
                    "trade_id": trade_id,
                    "bond_id": trade['bond_id'],
                    "bond_name": trade['bond_name'],
                    "units": trade['units'],
                    "investment_date": trade['investment_date'],
                    "cashflows": future_cashflows,
                    "total_expected_interest": sum(cf['interest_amount'] for cf in future_cashflows),
                    "total_expected_principal": sum(cf['principal_amount'] for cf in future_cashflows),
                    "tag": "reinvestment",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.clients.update_one(
                    {"id": trade['client_id']},
                    {"$push": {"bond_cashflow_records": client_cashflow_record}}
                )
    
    return {"message": f"Trade {update.status}", "trade_id": trade_id}


@api_router.delete("/trades/{trade_id}")
async def cancel_trade(trade_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel a pending trade"""
    trade = await db.trades.find_one({"id": trade_id})
    
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Only creator or broker can cancel
    if current_user['role'] != 'broker' and trade['created_by'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if trade['status'] != 'pending':
        raise HTTPException(status_code=400, detail="Only pending trades can be cancelled")
    
    await db.trades.delete_one({"id": trade_id})
    
    return {"message": "Trade cancelled"}


# ==================== END TRADE MANAGEMENT ====================


# ==================== HOLDINGS MANAGEMENT ====================

class RepaymentUpdate(BaseModel):
    is_repaid: bool
    repaid_date: Optional[str] = None
    repaid_amount: Optional[float] = None
    notes: Optional[str] = None


# XIRR calculation functions removed - using bond's secondary_irr directly


def generate_client_cashflows(trade: dict, bond: dict) -> List[dict]:
    """
    Generate cashflow schedule for a client based on their trade and bond details.
    Uses exact cashflows_per_unit if available (for secondary market bonds),
    otherwise falls back to calculated cashflows.
    Returns list of cashflow entries with repayment status.
    """
    investment_date = datetime.fromisoformat(trade['investment_date'].split('T')[0].split(' ')[0])
    units = trade['units']
    cashflows = []
    
    # Cutoff days for secondary market - use trade's value, then bond's value, then default 15
    cutoff_days = trade.get('cutoff_days', bond.get('cutoff_days', 15))
    from datetime import timedelta
    cutoff_date = investment_date + timedelta(days=cutoff_days)
    
    # Check if bond has exact cashflows per unit (preferred for secondary market)
    cashflows_per_unit = bond.get('cashflows_per_unit', [])
    
    if cashflows_per_unit:
        # Use EXACT cashflows per unit from bond definition
        for cf in cashflows_per_unit:
            cf_date_str = cf['date'].split('T')[0].split(' ')[0]
            cf_date = datetime.fromisoformat(cf_date_str)
            
            # Only include cashflows AFTER cutoff date (payments within cutoff are missed)
            if cf_date > cutoff_date:
                interest_per_unit = cf.get('interest_per_unit', 0)
                principal_per_unit = cf.get('principal_per_unit', 0)
                
                # Calculate amounts for this client's units
                gross_interest = interest_per_unit * units
                principal_amount = principal_per_unit * units
                total_gross = gross_interest + principal_amount
                
                # TDS on interest only
                tds = gross_interest * 0.10  # 10% TDS
                net_amount = total_gross - tds
                
                cashflows.append({
                    "id": str(uuid.uuid4()),
                    "trade_id": trade['id'],
                    "type": "combined" if (gross_interest > 0 and principal_amount > 0) else ("interest" if gross_interest > 0 else "principal"),
                    "date": cf_date_str,
                    "gross_amount": round(total_gross, 2),
                    "tds_amount": round(tds, 2),
                    "net_amount": round(net_amount, 2),
                    "principal_component": round(principal_amount, 2),
                    "interest_component": round(gross_interest, 2),
                    "is_repaid": False,
                    "repaid_date": None,
                    "repaid_actual_amount": None,
                    "notes": None
                })
    else:
        # Fallback: Use calculated cashflows from interest_payments and principal_payments
        # Get remaining interest payments after investment date
        for ip in bond.get('interest_payments', []):
            ip_date = datetime.fromisoformat(ip['date'])
            if ip_date > investment_date:
                gross_interest = ip['amount'] * units
                tds = gross_interest * 0.10  # 10% TDS
                net_interest = gross_interest - tds
                
                cashflows.append({
                    "id": str(uuid.uuid4()),
                    "trade_id": trade['id'],
                    "type": "interest",
                    "date": ip['date'],
                    "gross_amount": round(gross_interest, 2),
                    "tds_amount": round(tds, 2),
                    "net_amount": round(net_interest, 2),
                    "principal_component": 0,
                    "interest_component": round(gross_interest, 2),
                    "is_repaid": False,
                    "repaid_date": None,
                    "repaid_actual_amount": None,
                    "notes": None
                })
        
        # Get remaining principal payments after investment date
        total_units = bond.get('total_units', 1)
        principal_per_unit = bond['principal_amount'] / total_units if total_units > 0 else bond['principal_amount']
        
        for pp in bond.get('principal_payments', []):
            pp_date = datetime.fromisoformat(pp['date'])
            if pp_date > investment_date:
                principal_amount = principal_per_unit * (pp['percentage'] / 100) * units
                
                # Check if there's already a cashflow on this date (combine with interest)
                existing = next((cf for cf in cashflows if cf['date'] == pp['date']), None)
                if existing:
                    existing['principal_component'] = round(principal_amount, 2)
                    existing['gross_amount'] = round(existing['gross_amount'] + principal_amount, 2)
                    existing['net_amount'] = round(existing['net_amount'] + principal_amount, 2)
                else:
                    cashflows.append({
                        "id": str(uuid.uuid4()),
                        "trade_id": trade['id'],
                        "type": "principal",
                        "date": pp['date'],
                        "gross_amount": round(principal_amount, 2),
                        "tds_amount": 0,
                        "net_amount": round(principal_amount, 2),
                        "principal_component": round(principal_amount, 2),
                        "interest_component": 0,
                        "is_repaid": False,
                        "repaid_date": None,
                        "repaid_actual_amount": None,
                        "notes": None
                    })
    
    # Sort by date
    cashflows.sort(key=lambda x: x['date'])
    
    # FALLBACK: If no cashflows generated and bond has basic data, create a simple maturity cashflow
    if not cashflows:
        # Check if bond has enough basic data for a simple maturity cashflow
        end_date_str = bond.get('end_date', bond.get('maturity_date', ''))
        principal_amount = bond.get('principal_amount', bond.get('face_value', 0))
        interest_rate = bond.get('annual_interest_rate', bond.get('interest_rate', 0))
        
        if end_date_str and principal_amount > 0:
            try:
                end_date = datetime.fromisoformat(end_date_str.split('T')[0])
                
                # Calculate total expected return for this investment
                # Simple calculation: principal * units + estimated interest
                total_principal = (principal_amount / bond.get('total_units', 1)) * units
                
                # Estimate interest based on holding period
                days_to_maturity = (end_date - investment_date).days
                years_to_maturity = days_to_maturity / 365.0
                estimated_interest = total_principal * (interest_rate / 100) * years_to_maturity
                tds_on_interest = estimated_interest * 0.10
                
                gross_amount = total_principal + estimated_interest
                net_amount = gross_amount - tds_on_interest
                
                # Create a single maturity cashflow
                cashflows.append({
                    "id": str(uuid.uuid4()),
                    "trade_id": trade['id'],
                    "type": "maturity",
                    "date": end_date_str.split('T')[0],
                    "gross_amount": round(gross_amount, 2),
                    "tds_amount": round(tds_on_interest, 2),
                    "net_amount": round(net_amount, 2),
                    "principal_component": round(total_principal, 2),
                    "interest_component": round(estimated_interest, 2),
                    "is_repaid": False,
                    "repaid_date": None,
                    "repaid_actual_amount": None,
                    "notes": "Auto-generated maturity cashflow (bond missing detailed payment schedule)"
                })
            except Exception as e:
                pass  # Skip fallback if date parsing fails
    
    return cashflows


@api_router.get("/holdings/clients")
async def get_holdings_clients(current_user: dict = Depends(get_current_user)):
    """Get list of clients with their holding summaries for the Holdings page"""
    
    # Get clients based on role
    if current_user['role'] == 'broker':
        clients = await db.clients.find({"created_by": current_user['id']}, {"_id": 0}).to_list(1000)
    elif current_user['role'] == 'client':
        # Clients see only themselves
        client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
        clients = [client] if client else []
    else:
        # Sub-brokers see only linked clients
        clients = await db.clients.find({"linked_subbroker_id": current_user['id']}, {"_id": 0}).to_list(1000)
    
    # Get approved trades for each client
    client_summaries = []
    for client in clients:
        trades = await db.trades.find({
            "client_id": client['id'],
            "status": "approved"
        }, {"_id": 0}).to_list(100)
        
        total_investment = sum(t.get('total_amount', 0) for t in trades)
        
        client_summaries.append({
            "id": client['id'],
            "name": client['name'],
            "pan_number": client['pan_number'],
            "total_investment": round(total_investment, 2),
            "trade_count": len(trades),
            "is_active": client.get('is_active', True)
        })
    
    return client_summaries



def build_actual_cashflows_with_investment(trades_data, stored_cashflows, actual_repayments=None, bond_info=None):
    """
    Build actual cashflows array with:
    1. ALL investment entries from trades (outflows)
    2. ALL actual repayments from actual_repayments collection (prepayments)
    3. CALCULATED maturity amount based on prepayments affecting principal and interest
    
    Following Excel calculation logic:
    - Each prepayment reduces balance principal
    - Interest = Balance Principal × Coupon Rate × Days / 365
    - Accumulated interest paid at maturity with remaining principal
    
    IMPORTANT: Interest is calculated from BOND START DATE (not investment date)
    because the premium paid at secondary market includes accrued interest.
    
    Args:
        trades_data: List of dicts with {investment_date, calculated_investment, units, total_principal, coupon_rate, maturity_date, bond_start_date}
        stored_cashflows: All scheduled cashflows for this bond (for fallback)
        actual_repayments: All actual repayments from uploads (THESE ARE THE SOURCE OF TRUTH)
        bond_info: Bond details including coupon_rate, end_date for maturity calculations
    """
    from datetime import datetime, timezone
    
    actual_repayments = actual_repayments or []
    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    actual_cashflows = []
    
    # Extract trade info (use first trade's data for calculations)
    trade_info = trades_data[0] if trades_data else {}
    inv_date_str = trade_info.get('investment_date', '')
    inv_amount = trade_info.get('calculated_investment', 0) or trade_info.get('invested_amount', 0)
    total_principal = trade_info.get('total_principal', 0)
    coupon_rate = trade_info.get('coupon_rate', 0)
    maturity_date_str = trade_info.get('maturity_date', '')
    bond_start_date_str = trade_info.get('bond_start_date', '')
    
    # Get bond info for fallback values
    if bond_info:
        if not coupon_rate:
            coupon_rate = bond_info.get('coupon_rate', 0) or bond_info.get('annual_interest_rate', 0) or bond_info.get('interest_rate', 0)
        if not maturity_date_str:
            maturity_date_str = bond_info.get('end_date', '') or bond_info.get('maturity_date', '')
        if not bond_start_date_str:
            bond_start_date_str = bond_info.get('start_date', '') or bond_info.get('bond_start_date', '')
    
    # Convert coupon rate to decimal if percentage
    if coupon_rate > 1:
        coupon_rate = coupon_rate / 100
    
    # 1. Add ALL investment entries (outflows - negative)
    for ti in trades_data:
        t_inv_date = ti.get('investment_date', '')
        t_inv_amount = ti.get('calculated_investment', 0) or ti.get('invested_amount', 0)
        if t_inv_amount > 0:
            actual_cashflows.append({
                'date': t_inv_date,
                'type': 'investment',
                'amount': -t_inv_amount,
                'principal_component': 0,
                'interest_component': 0,
                'gross_amount': -t_inv_amount,
                'tds_amount': 0,
                'net_amount': -t_inv_amount,
                'is_repaid': True,
                'source': 'investment',
                'units': ti.get('units', 0)
            })
    
    # 2. Process actual repayments and track prepayments
    # Sort repayments by date to calculate balance principal correctly
    sorted_repayments = sorted(actual_repayments, key=lambda x: x.get('repayment_date', ''))
    
    prepayments = []  # Track prepayments for interest calculation
    total_prepaid_principal = 0
    has_maturity_entry = False  # Check if maturity is already in actual_repayments
    
    for ar in sorted_repayments:
        ar_date = ar.get('repayment_date', '')
        ar_date_short = ar_date[:10] if ar_date else ''
        
        principal = ar.get('principal', 0) or 0
        interest = ar.get('interest', 0) or 0
        tds = ar.get('tds', 0) or 0
        gross = ar.get('gross_amount', 0) or (principal + interest)
        net = ar.get('net_amount', 0) or (gross - tds)
        
        # Determine if this is past (received) or future (expected)
        is_past = ar_date_short <= today_str if ar_date_short else False
        
        # Check if this is the maturity entry (final payment with both principal and interest)
        is_maturity = (principal > 0 and interest > 0 and ar_date_short == maturity_date_str[:10] if maturity_date_str else False)
        
        # Determine type based on principal/interest composition
        if is_maturity:
            cf_type = 'maturity'
            has_maturity_entry = True
        elif principal > 0 and interest == 0:
            cf_type = 'prepayment'
            # Track this prepayment for interest calculation
            prepayments.append({
                'date': ar_date_short,
                'principal': principal
            })
            total_prepaid_principal += principal
        elif interest > 0 and principal == 0:
            cf_type = 'interest'
        else:
            cf_type = 'repayment'
        
        actual_cashflows.append({
            'date': ar_date,
            'type': cf_type,
            'amount': gross,
            'principal_component': principal,
            'interest_component': interest,
            'gross_amount': gross,
            'tds_amount': tds,
            'net_amount': net,
            'is_repaid': is_past,
            'source': 'actual_upload',
            'balance_principal_after': total_principal - total_prepaid_principal if total_principal else None
        })
    
    # 3. Calculate and add maturity entry if not already present and we have prepayments
    if actual_repayments and not has_maturity_entry and prepayments and total_principal > 0 and coupon_rate > 0:
        # Calculate remaining principal at maturity
        remaining_principal = total_principal - total_prepaid_principal
        
        if remaining_principal > 0 and maturity_date_str:
            # Calculate accumulated interest period by period
            # IMPORTANT: Interest is calculated from BOND START DATE (not investment date)
            # The client's premium at secondary market includes the accrued interest
            # Following Excel logic: Interest = Balance Principal × Coupon × Days / 365
            
            accumulated_interest = 0
            balance_principal = total_principal
            
            try:
                # Parse dates - use BOND START DATE for interest calculation
                bond_start = None
                if bond_start_date_str:
                    bond_start = datetime.fromisoformat(bond_start_date_str.replace('Z', '+00:00').split('T')[0])
                inv_date = datetime.fromisoformat(inv_date_str.replace('Z', '+00:00').split('T')[0]) if inv_date_str else None
                maturity_date = datetime.fromisoformat(maturity_date_str.replace('Z', '+00:00').split('T')[0]) if maturity_date_str else None
                
                # Use bond start date for interest calculation if available, else investment date
                interest_start_date = bond_start if bond_start else inv_date
                
                if interest_start_date and maturity_date:
                    # Build timeline of events - start from BOND START DATE
                    events = [{'date': interest_start_date, 'type': 'start', 'amount': 0}]
                    
                    for p in prepayments:
                        try:
                            p_date = datetime.fromisoformat(p['date'].replace('Z', '+00:00').split('T')[0])
                            events.append({'date': p_date, 'type': 'prepayment', 'amount': p['principal']})
                        except:
                            pass
                    
                    events.append({'date': maturity_date, 'type': 'maturity', 'amount': 0})
                    events.sort(key=lambda x: x['date'])
                    
                    # Calculate interest for each period FROM BOND START
                    prev_date = interest_start_date
                    for event in events:
                        if event['type'] == 'start':
                            continue
                        
                        # Days from previous event
                        days = (event['date'] - prev_date).days
                        if days < 0:
                            days = 0
                        
                        # Interest for this period
                        period_interest = (balance_principal * coupon_rate * days) / 365
                        accumulated_interest += period_interest
                        
                        # Reduce balance on prepayment
                        if event['type'] == 'prepayment':
                            balance_principal -= event['amount']
                            if balance_principal < 0:
                                balance_principal = 0
                        
                        prev_date = event['date']
                    
                    # Final maturity amount
                    final_principal = balance_principal
                    final_interest = round(accumulated_interest, 2)
                    final_tds = round(final_interest * 0.10, 2)
                    final_gross = round(final_principal + final_interest, 2)
                    final_net = round(final_gross - final_tds, 2)
                    
                    # Only add if there's something to pay at maturity
                    if final_gross > 0:
                        actual_cashflows.append({
                            'date': maturity_date_str[:10] if maturity_date_str else '',
                            'type': 'maturity',
                            'amount': final_gross,
                            'principal_component': round(final_principal, 2),
                            'interest_component': final_interest,
                            'gross_amount': final_gross,
                            'tds_amount': final_tds,
                            'net_amount': final_net,
                            'is_repaid': False,
                            'source': 'calculated_with_prepayments',
                            'calculation_details': {
                                'original_principal': total_principal,
                                'total_prepaid': total_prepaid_principal,
                                'remaining_principal': final_principal,
                                'accumulated_interest': final_interest,
                                'coupon_rate_used': coupon_rate,
                                'interest_start_date': interest_start_date.strftime('%Y-%m-%d') if interest_start_date else None
                            }
                        })
            except Exception as e:
                # Fallback if date parsing fails
                pass
    
    # 4. Add FUTURE scheduled cashflows that don't have actual repayments yet
    # This ensures XIRR is calculated using ALL future cashflows (not just uploaded actuals)
    if stored_cashflows:
        # Get dates that already have actual repayment entries
        actual_repayment_dates = set()
        for ar in actual_repayments:
            ar_date = ar.get('repayment_date', '')[:10] if ar.get('repayment_date') else ''
            if ar_date:
                actual_repayment_dates.add(ar_date)
        
        # Add scheduled cashflows for dates that don't have actual repayments
        for cf in stored_cashflows:
            cf_date = cf.get('date', '')
            cf_date_short = cf_date[:10] if cf_date else ''
            
            # Skip if we already have an actual repayment for this date
            if cf_date_short in actual_repayment_dates:
                continue
            
            principal = cf.get('principal_component', 0) or 0
            interest = cf.get('interest_component', 0) or 0
            tds = cf.get('tds_amount', 0) or (interest * 0.1 if interest > 0 else 0)
            gross = principal + interest
            net = gross - tds
            
            if gross > 0:  # Only add non-zero cashflows
                # Determine if this cashflow is in the past
                is_past = cf_date_short <= today_str if cf_date_short else False
                
                actual_cashflows.append({
                    'date': cf_date,
                    'type': 'scheduled_payment',
                    'amount': gross,
                    'principal_component': principal,
                    'interest_component': interest,
                    'gross_amount': gross,
                    'tds_amount': round(tds, 2),
                    'net_amount': round(net, 2),
                    'is_repaid': is_past,
                    'source': 'scheduled_cashflow'
                })
    
    # Sort by date
    actual_cashflows.sort(key=lambda x: x.get('date', ''))
    
    return actual_cashflows



@api_router.get("/holdings/client/{client_id}")
async def get_client_holdings(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed holdings for a specific client"""
    
    # Verify client access
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] == 'client':
        # Client can only access their own holdings
        if client.get('user_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Sub-broker
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Get approved trades for this client
    trades = await db.trades.find({
        "client_id": client_id,
        "status": "approved"
    }, {"_id": 0}).to_list(100)
    
    holdings = []
    total_investment = 0
    total_repaid = 0
    total_upcoming = 0
    
    for trade in trades:
        # Get bond details
        bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
        if not bond:
            continue
        
        # Check if we have stored cashflows, otherwise generate them
        stored_cashflows = await db.holding_cashflows.find({
            "trade_id": trade['id']
        }, {"_id": 0}).to_list(100)
        
        if not stored_cashflows:
            # Generate and store cashflows
            cashflows = generate_client_cashflows(trade, bond)
            if cashflows:
                for cf in cashflows:
                    cf['client_id'] = client_id
                    cf['bond_id'] = trade['bond_id']
                    cf['bond_name'] = trade['bond_name']
                await db.holding_cashflows.insert_many(cashflows)
                # Refetch to ensure we don't have _id in response
                stored_cashflows = await db.holding_cashflows.find({
                    "trade_id": trade['id']
                }, {"_id": 0}).to_list(100)
        
        # Fetch actual_repayments for this trade (historical uploads, email synced)
        trade_actual_repayments = await db.actual_repayments.find({
            "bond_id": trade['bond_id'],
            "client_id": client_id
        }, {"_id": 0}).to_list(500)
        
        # Filter actual_repayments to match this trade's investment date
        # If actual_repayment has investment_date, it must match the trade's investment_date
        # If actual_repayment has NO investment_date, include it (it applies to any trade for this bond/client)
        trade_inv_date = trade.get('investment_date', '')[:10] if trade.get('investment_date') else ''
        matched_actual_repayments = []
        for ar in trade_actual_repayments:
            ar_inv_date = ar.get('investment_date', '')[:10] if ar.get('investment_date') else ''
            # Include if:
            # 1. Investment dates match exactly, OR
            # 2. actual_repayment has no investment_date (applies to all trades for this bond/client)
            if ar_inv_date == trade_inv_date or not ar_inv_date:
                matched_actual_repayments.append(ar)
        
        # Calculate totals for this holding (use GROSS amounts = principal + interest)
        investment_amount = trade.get('total_amount', 0)
        
        # Get today's date for comparison
        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        # ============================================
        # REPAYMENT STATUS LOGIC (User requirement):
        # - RECEIVED = Sum from actual_repayments where repayment_date <= today
        # - OUTSTANDING = Sum from holding_cashflows where scheduled date > today
        # - TOTAL = RECEIVED + OUTSTANDING
        # ============================================
        
        # Calculate RECEIVED: Sum from actual_repayments where date is in the PAST (including today)
        repaid_gross = 0
        repaid_principal = 0
        repaid_interest = 0
        repaid_tds = 0
        
        for ar in matched_actual_repayments:
            ar_date = (ar.get('repayment_date') or '')[:10]
            if ar_date and ar_date <= today_str:  # Only count if date is today or in the past
                repaid_gross += ar.get('gross_amount', 0) or (ar.get('principal', 0) + ar.get('interest', 0))
                repaid_principal += ar.get('principal', 0) or 0
                repaid_interest += ar.get('interest', 0) or 0
                repaid_tds += ar.get('tds', 0) or 0
        
        # Calculate OUTSTANDING: Sum from holding_cashflows where date > today (FUTURE)
        upcoming_gross = 0
        for cf in stored_cashflows:
            cf_date = (cf.get('date') or '')[:10]
            if cf_date and cf_date > today_str:  # Only count if date is in the FUTURE
                upcoming_gross += (cf.get('principal_component', 0) or 0) + (cf.get('interest_component', 0) or 0)
        
        # Calculate total scheduled from holding_cashflows (for other calculations)
        total_scheduled_gross = sum(
            (cf.get('principal_component', 0) or 0) + (cf.get('interest_component', 0) or 0)
            for cf in stored_cashflows
        )
        
        # Calculate principal and interest components
        total_principal = sum(cf.get('principal_component', 0) for cf in stored_cashflows)
        total_interest_gross = sum(cf.get('interest_component', 0) for cf in stored_cashflows)
        total_tds = sum(cf.get('tds_amount', 0) for cf in stored_cashflows)
        total_net_interest = total_interest_gross - total_tds
        
        # Note: repaid_principal, repaid_interest, repaid_tds are already calculated above
        # from actual_repayments where date <= today
        
        # Calculate prepaid info (prepaid principal only, no interest)
        prepaid_cashflows = [cf for cf in stored_cashflows if cf.get('is_prepaid') or cf.get('type') == 'prepayment']
        prepaid_amount = sum(cf.get('principal_component', 0) for cf in prepaid_cashflows)
        
        # Get bond start date for XIRR calculation
        # IMPORTANT: XIRR uses bond start date (not investment date) to properly
        # reflect impact of premium when bond is sold at secondary market
        bond_start_date = bond.get('start_date') or bond.get('bond_start_date')
        
        # Build ORIGINAL cashflows from BOND DEFINITION (not from stored cashflows)
        # This represents what was promised in the bond - the Expected Repayments
        # Uses secondary market calculator logic for units sold at premium
        original_cashflows = []
        calculated_investment = 0  # Investment value from secondary calculator
        
        # Get cutoff date for this investment
        from datetime import timedelta
        investment_date_str = trade['investment_date'].split('T')[0].split(' ')[0]
        investment_date_dt = datetime.fromisoformat(investment_date_str)
        cutoff_days = trade.get('cutoff_days', bond.get('cutoff_days', 15))
        secondary_irr = bond.get('secondary_irr', bond.get('primary_irr', 12))
        irr_decimal = secondary_irr / 100
        
        # Use cashflows_per_unit from bond definition
        cashflows_per_unit = bond.get('cashflows_per_unit', [])
        
        if cashflows_per_unit:
            # Calculate expected cashflows using secondary market logic
            # Also calculate PV for investment value
            pv_total_per_unit = 0
            
            for cf in cashflows_per_unit:
                cf_date_str = cf.get('date', '').split('T')[0].split(' ')[0]
                try:
                    cf_date = datetime.fromisoformat(cf_date_str)
                except:
                    continue
                
                # Record date convention: payment date - cutoff_days
                record_date = cf_date - timedelta(days=cutoff_days)
                
                # Only include cashflows where investment_date <= record_date
                # This means the investor is entitled to this payment
                if investment_date_dt <= record_date:
                    interest_per_unit = cf.get('interest_per_unit', 0) or 0
                    principal_per_unit = cf.get('principal_per_unit', 0) or 0
                    total_cf_per_unit = interest_per_unit + principal_per_unit
                    
                    # Calculate PV for secondary market price
                    days_to_cf = (cf_date - investment_date_dt).days
                    years = days_to_cf / 365
                    discount_factor = 1 / ((1 + irr_decimal) ** years)
                    pv_total_per_unit += total_cf_per_unit * discount_factor
                    
                    # Calculate amounts for this client's units
                    gross_interest = interest_per_unit * trade['units']
                    principal_amount = principal_per_unit * trade['units']
                    total_gross = gross_interest + principal_amount
                    tds = gross_interest * 0.10  # 10% TDS
                    net_amount = total_gross - tds
                    
                    original_cashflows.append({
                        'date': cf_date_str,
                        'principal_component': round(principal_amount, 2),
                        'interest_component': round(gross_interest, 2),
                        'gross_amount': round(total_gross, 2),
                        'tds_amount': round(tds, 2),
                        'net_amount': round(net_amount, 2),
                        'source': 'bond_template',
                        'days_from_investment': days_to_cf
                    })
            
            # Calculate investment value using secondary calculator
            calculated_investment = round(pv_total_per_unit * trade['units'], 2)
        
        # If no cashflows_per_unit, calculate expected from bond terms
        if not original_cashflows:
            # Calculate expected maturity payment from bond parameters
            face_value = bond.get('face_value', 100000)
            coupon_rate = bond.get('coupon_rate', 0)
            if coupon_rate > 1:
                coupon_rate = coupon_rate / 100  # Convert percentage to decimal
            
            maturity_date = bond.get('maturity_date', '')
            bond_start = bond.get('start_date', '')
            
            if maturity_date and bond_start:
                try:
                    maturity_dt = datetime.fromisoformat(maturity_date.split('T')[0].split(' ')[0])
                    bond_start_dt = datetime.fromisoformat(bond_start.split('T')[0].split(' ')[0])
                    
                    # Check if investor is entitled to maturity (investment <= record date)
                    record_date = maturity_dt - timedelta(days=cutoff_days)
                    
                    if investment_date_dt <= record_date:
                        # Calculate days from INVESTMENT DATE to maturity
                        days_to_maturity = (maturity_dt - investment_date_dt).days
                        total_days = (maturity_dt - bond_start_dt).days
                        
                        # Principal at maturity
                        principal_amount = face_value * trade['units']
                        
                        # Interest calculation:
                        # For bonds sold at premium, interest is calculated from bond start to maturity
                        # The premium accounts for the "missed" interest from bond start to investment date
                        gross_interest = round(principal_amount * coupon_rate * total_days / 365, 2)
                        
                        tds = round(gross_interest * 0.10, 2)
                        total_gross = principal_amount + gross_interest
                        net_amount = total_gross - tds
                        
                        # Calculate investment value using secondary calculator (PV of maturity payment)
                        years_to_maturity = days_to_maturity / 365
                        discount_factor = 1 / ((1 + irr_decimal) ** years_to_maturity)
                        calculated_investment = round(total_gross * discount_factor, 2)
                        
                        original_cashflows.append({
                            'date': maturity_date.split('T')[0].split(' ')[0],
                            'principal_component': round(principal_amount, 2),
                            'interest_component': round(gross_interest, 2),
                            'gross_amount': round(total_gross, 2),
                            'tds_amount': round(tds, 2),
                            'net_amount': round(net_amount, 2),
                            'source': 'calculated_from_bond_terms',
                            'days_to_maturity': days_to_maturity,
                            'total_bond_days': total_days
                        })
                except Exception as e:
                    logger.error(f"Error calculating expected cashflows: {e}")
        
        # If no cashflows_per_unit and no original_cashflows calculated, fallback to maturity calculation
        if not original_cashflows:
                # If all cashflows are prepaid, create expected from maturity date
                # This is a fallback when no original data is available
                maturity_date = bond.get('maturity_date')
                if maturity_date:
                    # Calculate expected interest based on bond terms
                    # Interest = Principal × Rate × Days / 365
                    bond_start = bond.get('start_date', '')
                    maturity_str = maturity_date.split('T')[0] if 'T' in maturity_date else maturity_date
                    
                    face_value = bond.get('face_value', 100000)
                    coupon_rate = bond.get('coupon_rate', 0) / 100 if bond.get('coupon_rate', 0) > 1 else bond.get('coupon_rate', 0)
                    
                    principal_amount = face_value * trade['units']
                    
                    # Calculate interest for full term (from bond start to maturity)
                    try:
                        bond_start_dt = datetime.fromisoformat(bond_start.split('T')[0])
                        maturity_dt = datetime.fromisoformat(maturity_str)
                        days = (maturity_dt - bond_start_dt).days
                        gross_interest = round(principal_amount * coupon_rate * days / 365, 2)
                    except:
                        # Fallback: use simple annual calculation
                        gross_interest = round(principal_amount * coupon_rate * 1.5, 2)  # ~18 months
                    
                    tds = round(gross_interest * 0.10, 2)
                    total_gross = principal_amount + gross_interest
                    net_amount = total_gross - tds
                    
                    original_cashflows.append({
                        'date': maturity_str,
                        'principal_component': round(principal_amount, 2),
                        'interest_component': round(gross_interest, 2),
                        'gross_amount': round(total_gross, 2),
                        'tds_amount': round(tds, 2),
                        'net_amount': round(net_amount, 2)
                    })
        
        # Fetch actual repayments (unscheduled prepayments from historical uploads)
        # Note: We only include actual_repayments that are NOT on scheduled dates
        # to avoid double-counting
        actual_repayments = await db.actual_repayments.find({
            "bond_id": trade['bond_id'],
            "client_id": client_id
        }, {"_id": 0}).to_list(100)
        
        # Filter to only include repayments that match this trade's investment date
        # This allows matching prepayments to specific trades when multiple trades exist for same bond
        trade_inv_date = trade.get('investment_date', '')[:10] if trade.get('investment_date') else ''
        trade_matched_repayments = []
        for ar in actual_repayments:
            ar_inv_date = ar.get('investment_date', '')[:10] if ar.get('investment_date') else ''
            # Only include if investment dates match exactly
            # Skip actual_repayments without investment_date (legacy data) - they need to be re-uploaded
            if ar_inv_date and ar_inv_date == trade_inv_date:
                trade_matched_repayments.append(ar)
        
        # Get scheduled dates from THIS TRADE's cashflows to filter out duplicates
        scheduled_dates = set()
        for cf in stored_cashflows:
            if cf.get('date'):
                scheduled_dates.add(cf['date'].split('T')[0])
        
        # Filter to only include actual repayments on dates NOT in this trade's schedule
        unscheduled_repayments = [
            ar for ar in trade_matched_repayments 
            if ar.get('repayment_date') and ar['repayment_date'].split('T')[0] not in scheduled_dates
        ]
        
        # Use bond's Secondary IRR for Expected XIRR
        expected_xirr = bond.get('secondary_irr') or bond.get('interest_rate') or bond.get('coupon_rate')
        
        # Build actual_cashflows FIRST (which includes calculated maturity)
        # Then use this for XIRR calculation
        actual_cashflows_data = build_actual_cashflows_with_investment(
            [{
                'investment_date': investment_date_str, 
                'calculated_investment': calculated_investment, 
                'units': trade['units'],
                'total_principal': round(bond.get('face_value', 100000) * trade['units'], 2),
                'coupon_rate': bond.get('coupon_rate', 0) or bond.get('annual_interest_rate', 0) or bond.get('interest_rate', 0),
                'maturity_date': bond.get('end_date', '') or bond.get('maturity_date', ''),
                'bond_start_date': bond.get('start_date', '') or bond.get('bond_start_date', '')
            }],
            stored_cashflows,
            matched_actual_repayments,
            bond_info=bond
        )
        
        # RECALCULATE repaid_gross and upcoming_gross from actual_cashflows_data
        # This ensures the summary uses the ACTUAL cashflows (with prepayment interest adjustments)
        # instead of the original expected cashflows
        if actual_cashflows_data:
            actual_repaid_gross = 0
            actual_upcoming_gross = 0
            
            for cf in actual_cashflows_data:
                cf_date = (cf.get('date') or '')[:10]
                cf_type = cf.get('type', '')
                gross_amount = cf.get('gross_amount', 0) or cf.get('amount', 0)
                
                # Skip investment entries (outflows)
                if cf_type == 'investment' or gross_amount < 0:
                    continue
                
                # Check if is_repaid flag is set, OR if date is in the past
                is_past = cf.get('is_repaid', False) or (cf_date and cf_date <= today_str)
                
                if is_past:
                    actual_repaid_gross += gross_amount
                else:
                    actual_upcoming_gross += gross_amount
            
            # Use actual cashflow values for summary if we have actual repayments
            if matched_actual_repayments:
                repaid_gross = actual_repaid_gross
                upcoming_gross = actual_upcoming_gross
        
        # Calculate ACTUAL XIRR from the complete actual_cashflows (includes calculated maturity)
        actual_xirr = None
        
        if actual_cashflows_data and len(actual_cashflows_data) >= 2:
            try:
                # Build cashflow series for XIRR from actual_cashflows
                xirr_dates = []
                xirr_values = []
                
                for cf in actual_cashflows_data:
                    cf_date_str = cf.get('date', '')
                    cf_date_str = cf_date_str.split('T')[0].split(' ')[0] if cf_date_str else ''
                    if not cf_date_str:
                        continue
                    try:
                        cf_date = datetime.fromisoformat(cf_date_str)
                        # Use gross_amount (negative for investment, positive for inflows)
                        gross_amount = cf.get('gross_amount', 0) or cf.get('amount', 0)
                        if gross_amount != 0:
                            xirr_dates.append(cf_date)
                            xirr_values.append(gross_amount)
                    except:
                        continue
                
                # Only calculate if we have at least 2 cashflows with sign change
                if len(xirr_dates) >= 2 and len(xirr_values) >= 2:
                    # Sort by date
                    sorted_cashflows = sorted(zip(xirr_dates, xirr_values), key=lambda x: x[0])
                    xirr_dates = [x[0] for x in sorted_cashflows]
                    xirr_values = [x[1] for x in sorted_cashflows]
                    
                    # Verify we have both negative and positive cashflows
                    has_negative = any(v < 0 for v in xirr_values)
                    has_positive = any(v > 0 for v in xirr_values)
                    
                    if has_negative and has_positive:
                        calculated_actual_xirr = calculate_xirr(xirr_dates, xirr_values)
                        if calculated_actual_xirr is not None and -1 < calculated_actual_xirr < 10:  # Sanity check
                            actual_xirr = round(calculated_actual_xirr * 100, 2)  # Convert to percentage
            except Exception as e:
                logger.error(f"Error calculating actual XIRR: {e}")
        
        # Fallback to expected XIRR if actual couldn't be calculated
        if actual_xirr is None:
            actual_xirr = expected_xirr
        
        # GROSS Profit = Gross Expected - Investment
        gross_expected = total_principal + total_interest_gross
        gross_profit = gross_expected - investment_amount
        
        # Build expected_cashflows with investment as the first entry (outflow)
        expected_cashflows_with_investment = []
        
        # Add investment entry (outflow - negative)
        if calculated_investment > 0:
            expected_cashflows_with_investment.append({
                'date': investment_date_str,
                'type': 'investment',
                'amount': -calculated_investment,  # Negative = outflow
                'principal_component': 0,
                'interest_component': 0,
                'gross_amount': -calculated_investment,
                'tds_amount': 0,
                'net_amount': -calculated_investment,
                'source': 'secondary_calculator',
                'description': f'Investment ({trade["units"]} units @ Secondary IRR {secondary_irr}%)'
            })
        
        # Add inflows (maturity payments)
        for cf in original_cashflows:
            cf_entry = cf.copy()
            cf_entry['type'] = 'inflow'
            cf_entry['amount'] = cf.get('gross_amount', 0)  # Positive = inflow
            expected_cashflows_with_investment.append(cf_entry)
        
        holdings.append({
            "trade_id": trade['id'],
            "bond_id": trade['bond_id'],
            "bond_name": trade['bond_name'],
            "units": trade['units'],
            "investment_date": trade['investment_date'],
            "invested_amount": round(investment_amount, 2),
            "calculated_investment": round(calculated_investment, 2),  # From secondary calculator
            "total_principal": round(total_principal, 2),
            "total_interest_gross": round(total_interest_gross, 2),
            "total_tds": round(total_tds, 2),
            "gross_expected": round(gross_expected, 2),  # GROSS = Principal + Interest
            "gross_profit": round(gross_profit, 2),  # GROSS Profit
            "total_net_expected": round(total_principal + total_net_interest, 2),
            "repaid_principal": round(repaid_principal, 2),
            "repaid_interest": round(repaid_interest, 2),
            "repaid_tds": round(repaid_tds, 2),
            "gross_repaid": round(repaid_gross, 2),  # GROSS repaid
            "net_repaid": round(repaid_principal + repaid_interest - repaid_tds, 2),
            "gross_upcoming": round(upcoming_gross, 2),  # GROSS upcoming
            "upcoming_expected": round(upcoming_gross, 2),  # For backward compatibility
            "prepaid_count": len(prepaid_cashflows),
            "prepaid_amount": round(prepaid_amount, 2),
            "xirr": expected_xirr,  # Bond's Secondary IRR
            "actual_xirr": actual_xirr,  # Calculated from actual_cashflows (includes maturity)
            "cashflows": stored_cashflows,  # Current state of cashflows
            "expected_cashflows": expected_cashflows_with_investment,  # With investment as first entry
            "actual_cashflows": actual_cashflows_data,  # Already built above, reuse
            "status": "active" if upcoming_gross > 0 else "fully_repaid"
        })
        
        total_investment += investment_amount
        total_repaid += repaid_gross  # Use GROSS repaid
        total_upcoming += upcoming_gross  # Use GROSS upcoming
    
    return {
        "client": {
            "id": client['id'],
            "name": client['name'],
            "pan_number": client['pan_number'],
            "email": client.get('email'),
            "mobile": client.get('mobile')
        },
        "summary": {
            "total_investment": round(total_investment, 2),
            "total_repaid": round(total_repaid, 2),  # GROSS repaid
            "total_upcoming": round(total_upcoming, 2),  # GROSS upcoming
            "total_expected": round(total_repaid + total_upcoming, 2),  # Total GROSS expected
            "total_profit": round((total_repaid + total_upcoming) - total_investment, 2)  # GROSS profit
        },
        "holdings": holdings
    }


@api_router.put("/holdings/cashflow/{cashflow_id}/mark-repaid")
async def mark_cashflow_repaid(cashflow_id: str, update: RepaymentUpdate, current_user: dict = Depends(get_current_user)):
    """Mark a cashflow entry as repaid (broker or sub-broker can do this)"""
    
    # Find the cashflow
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow entry not found")
    
    # Verify access to the client
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Update cashflow - detect if this is a prepayment
    scheduled_date = datetime.fromisoformat(cashflow['date'].replace('Z', '+00:00')) if 'T' in cashflow['date'] else datetime.strptime(cashflow['date'], '%Y-%m-%d')
    
    actual_date_str = update.repaid_date or datetime.now(timezone.utc).isoformat()
    actual_date = datetime.fromisoformat(actual_date_str.replace('Z', '+00:00')) if 'T' in actual_date_str else datetime.strptime(actual_date_str, '%Y-%m-%d')
    
    # Prepayment: if actual date is before scheduled date
    is_prepaid = actual_date.date() < scheduled_date.date() if update.is_repaid else False
    days_early = (scheduled_date.date() - actual_date.date()).days if is_prepaid else 0
    
    update_data = {
        "is_repaid": update.is_repaid,
        "repaid_date": actual_date_str,
        "repaid_actual_amount": update.repaid_amount,
        "is_prepaid": is_prepaid,
        "days_early": days_early,
        "notes": update.notes,
        "marked_by": current_user['id'],
        "marked_at": datetime.now(timezone.utc).isoformat()
    }
    
    if not update.is_repaid:
        update_data["repaid_date"] = None
        update_data["repaid_actual_amount"] = None
        update_data["is_prepaid"] = False
        update_data["days_early"] = 0
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": update_data}
    )
    
    # If this is a principal prepayment, recalculate subsequent interest
    interest_amended = 0
    if update.is_repaid and is_prepaid and cashflow.get('principal_component', 0) > 0:
        interest_amended = await recalculate_interest_after_prepayment(
            trade_id=cashflow['trade_id'],
            prepayment_date=actual_date,
            prepaid_principal=cashflow.get('principal_component', 0),
            current_user_id=current_user['id']
        )
    
    return {
        "message": "Cashflow updated successfully", 
        "is_repaid": update.is_repaid,
        "is_prepaid": is_prepaid,
        "days_early": days_early,
        "interest_amended": interest_amended
    }


async def recalculate_interest_after_prepayment(trade_id: str, prepayment_date: datetime, prepaid_principal: float, current_user_id: str) -> int:
    """
    DEPRECATED: Use process_bond_prepayment() instead.
    This function is kept for backward compatibility but now delegates to the unified prepayment processor.
    
    Recalculate interest for all future cashflows after a principal prepayment.
    Returns the number of interest entries amended.
    """
    result = await process_bond_prepayment(
        db_instance=db,
        trade_id=trade_id,
        prepayment_amount=prepaid_principal,
        prepayment_date=prepayment_date,
        source="legacy_recalculate",
        recorded_by=current_user_id,
        notes="Called via legacy recalculate_interest_after_prepayment"
    )
    
    return result.get('cashflows_modified', 0)


@api_router.post("/holdings/cashflow/{cashflow_id}/amend-interest")
async def amend_cashflow_interest(
    cashflow_id: str, 
    amended_interest: float = Body(..., embed=True),
    reason: str = Body(None, embed=True),
    current_user: dict = Depends(get_current_user)
):
    """Manually amend interest amount for a cashflow entry"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can amend cashflows")
    
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow entry not found")
    
    # Verify access
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Store original values if not already stored
    original_interest = cashflow.get('original_interest_component') or cashflow.get('interest_component', 0)
    original_tds = cashflow.get('original_tds_amount') or cashflow.get('tds_amount', 0)
    original_net = cashflow.get('original_net_amount') or cashflow.get('net_amount', 0)
    original_gross = cashflow.get('original_gross_amount') or cashflow.get('gross_amount', 0)
    
    # Calculate new TDS and net amounts
    new_tds = round(amended_interest * 0.10, 2)
    principal = cashflow.get('principal_component', 0)
    new_gross = round(amended_interest + principal, 2)
    new_net = round(amended_interest - new_tds + principal, 2)
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": {
            "original_interest_component": original_interest,
            "original_tds_amount": original_tds,
            "original_net_amount": original_net,
            "original_gross_amount": original_gross,
            "interest_component": amended_interest,
            "tds_amount": new_tds,
            "gross_amount": new_gross,
            "net_amount": new_net,
            "is_amended": True,
            "amendment_reason": reason or "Manual amendment",
            "amendment_date": datetime.now(timezone.utc).isoformat(),
            "amended_by": current_user['id']
        }}
    )
    
    return {
        "message": "Interest amended successfully",
        "original_interest": original_interest,
        "amended_interest": amended_interest,
        "new_tds": new_tds,
        "new_net": new_net
    }


@api_router.post("/holdings/cashflow/{cashflow_id}/revert-amendment")
async def revert_cashflow_amendment(cashflow_id: str, current_user: dict = Depends(get_current_user)):
    """Revert an amended cashflow back to original values"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can revert amendments")
    
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow entry not found")
    
    if not cashflow.get('is_amended'):
        raise HTTPException(status_code=400, detail="This cashflow has not been amended")
    
    # Verify access
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Revert to original values
    original_interest = cashflow.get('original_interest_component', cashflow.get('interest_component', 0))
    original_tds = cashflow.get('original_tds_amount', cashflow.get('tds_amount', 0))
    original_net = cashflow.get('original_net_amount', cashflow.get('net_amount', 0))
    original_gross = cashflow.get('original_gross_amount', cashflow.get('gross_amount', 0))
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {
            "$set": {
                "interest_component": original_interest,
                "tds_amount": original_tds,
                "net_amount": original_net,
                "gross_amount": original_gross,
                "is_amended": False,
                "reverted_at": datetime.now(timezone.utc).isoformat(),
                "reverted_by": current_user['id']
            },
            "$unset": {
                "amendment_reason": "",
                "amendment_date": "",
                "amended_by": "",
                "remaining_principal_ratio": ""
            }
        }
    )
    
    return {"message": "Amendment reverted successfully"}


class PrincipalPrepaymentRequest(BaseModel):
    prepayment_date: str  # Date when principal was prepaid
    prepaid_amount: float  # Amount of principal prepaid
    notes: Optional[str] = None


@api_router.post("/holdings/trade/{trade_id}/record-prepayment")
async def record_principal_prepayment(
    trade_id: str,
    prepayment: PrincipalPrepaymentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Record a principal prepayment for a trade/holding.
    Uses the unified process_bond_prepayment function which:
    1. Proportionally reduces ALL remaining principal payments
    2. Recalculates future interest based on reduced principal (same coupon rate)
    3. Updates trade with remaining principal info
    4. Auto-closes trade if fully prepaid
    """
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can record prepayments")
    
    # Get trade and verify access
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    client = await db.clients.find_one({"id": trade['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Parse prepayment date
    try:
        prepayment_date = datetime.strptime(prepayment.prepayment_date, "%Y-%m-%d")
    except:
        try:
            prepayment_date = datetime.strptime(prepayment.prepayment_date, "%d-%m-%Y")
        except:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY")
    
    # Process the prepayment using unified function
    result = await process_bond_prepayment(
        db_instance=db,
        trade_id=trade_id,
        prepayment_amount=prepayment.prepaid_amount,
        prepayment_date=prepayment_date,
        source="manual",
        recorded_by=current_user['id'],
        notes=prepayment.notes
    )
    
    if not result.get('success'):
        raise HTTPException(
            status_code=400,
            detail=result.get('errors', ['Unknown error processing prepayment'])[0]
        )
    
    # Get bond details for email
    bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
    
    # Send email notification
    email_sent = False
    try:
        client_full = await db.clients.find_one({"id": trade['client_id']}, {"_id": 0})
        broker = await db.users.find_one({"id": client_full.get('created_by', '')}, {"_id": 0})
        broker_name = broker.get('name', 'Your Broker') if broker else 'Your Broker'
        
        if client_full and client_full.get('email'):
            revised_cfs = await db.holding_cashflows.find({
                "trade_id": trade_id,
                "is_repaid": {"$ne": True}
            }, {"_id": 0}).sort("date", 1).to_list(15)
            
            # Get prepayment percentages
            original_principal = bond.get('principal_amount', 0) * trade.get('units', 0)
            prepayment_percentage = round((prepayment.prepaid_amount / original_principal) * 100, 2) if original_principal > 0 else 0
            remaining_percentage = round((result['remaining_principal'] / original_principal) * 100, 2) if original_principal > 0 else 0
            
            email_sent = send_prepayment_notification_email(
                client_name=client_full.get('name', 'Valued Investor'),
                client_email=client_full['email'],
                bond_name=trade.get('bond_name', bond.get('name', 'N/A') if bond else 'N/A'),
                opportunity_id=bond.get('bond_code', bond.get('id', 'N/A')) if bond else 'N/A',
                prepayment_date=prepayment_date.strftime('%d %b %Y'),
                prepaid_amount=prepayment.prepaid_amount,
                prepayment_percentage=prepayment_percentage,
                original_principal=original_principal,
                remaining_principal=result['remaining_principal'],
                remaining_percentage=remaining_percentage,
                total_prepaid_to_date=prepayment.prepaid_amount,  # First prepayment or cumulative
                total_prepaid_percentage=prepayment_percentage,
                revised_cashflows=revised_cfs,
                broker_name=broker_name
            )
    except Exception as e:
        logger.error(f"Failed to send prepayment notification email: {str(e)}")
    
    return {
        "message": "Principal prepayment recorded successfully",
        "prepaid_amount": prepayment.prepaid_amount,
        "remaining_principal": result['remaining_principal'],
        "remaining_principal_ratio": result['remaining_principal_ratio'],
        "cashflows_modified": result['cashflows_modified'],
        "trade_closed": result['trade_closed'],
        "email_sent": email_sent
    }


@api_router.get("/holdings/trade/{trade_id}/prepayments")
async def get_trade_prepayments(trade_id: str, current_user: dict = Depends(get_current_user)):
    """Get all prepayment records for a trade"""
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Verify access
    client = await db.clients.find_one({"id": trade['client_id']})
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    prepayments = await db.prepayment_records.find(
        {"trade_id": trade_id},
        {"_id": 0}
    ).sort("prepayment_date", 1).to_list(50)
    
    return {
        "trade_id": trade_id,
        "bond_name": trade['bond_name'],
        "original_principal": trade.get('total_amount', 0),
        "total_prepaid": trade.get('total_prepaid_principal', 0),
        "remaining_principal": trade.get('remaining_principal', trade.get('total_amount', 0)),
        "prepayments": prepayments
    }


# ==================== BULK REPAYMENT UPLOAD ====================

@api_router.get("/holdings/repayment-template")
async def get_repayment_template(current_user: dict = Depends(get_current_user)):
    """Generate Excel template for bulk repayment updates"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can download repayment template")
    
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Repayment Updates"
    
    # Header style
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Headers
    headers = [
        "Client PAN*", "Bond Name*", "Scheduled Date*", "Type*",
        "Expected Amount", "Actual Paid Date*", "Actual Amount Received*", "Notes"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border
    
    # Set column widths
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 35
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 12
    ws.column_dimensions['E'].width = 18
    ws.column_dimensions['F'].width = 18
    ws.column_dimensions['G'].width = 22
    ws.column_dimensions['H'].width = 30
    
    # Add instructions sheet
    ws_inst = wb.create_sheet("Instructions")
    instructions = [
        "BULK REPAYMENT UPDATE - INSTRUCTIONS",
        "",
        "Required Fields (marked with *):",
        "1. Client PAN - The PAN number of the client (e.g., ABCDE1234F)",
        "2. Bond Name - Exact name of the bond as registered in the system",
        "3. Scheduled Date - Original scheduled payment date (DD-MM-YYYY format)",
        "4. Type - Either 'interest' or 'principal'",
        "5. Actual Paid Date - Date when payment was actually received (DD-MM-YYYY)",
        "6. Actual Amount Received - Amount received (numbers only, no commas)",
        "",
        "Optional Fields:",
        "7. Expected Amount - The originally expected amount (for reference)",
        "8. Notes - Any notes about this repayment",
        "",
        "IMPORTANT:",
        "- If Actual Paid Date is before Scheduled Date, it will be marked as PREPAID",
        "- Date format: DD-MM-YYYY (e.g., 15-01-2026)",
        "- Amount format: Plain numbers (e.g., 50000.00)",
        "- The system will match entries based on Client PAN + Bond Name + Scheduled Date + Type"
    ]
    
    for row, text in enumerate(instructions, 1):
        ws_inst.cell(row=row, column=1, value=text)
    ws_inst.column_dimensions['A'].width = 80
    
    # Save to buffer
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=repayment_update_template.xlsx"}
    )


@api_router.post("/holdings/bulk-repayment-upload")
async def bulk_repayment_upload(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Process bulk repayment updates from Excel file"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can upload repayments")
    
    from openpyxl import load_workbook
    from io import BytesIO
    
    try:
        content = await file.read()
        wb = load_workbook(BytesIO(content))
        ws = wb.active
        
        results = {
            "success": 0,
            "failed": 0,
            "prepaid": 0,
            "errors": []
        }
        
        # Skip header row
        for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row[0]:  # Skip empty rows
                continue
            
            try:
                client_pan = str(row[0]).strip().upper()
                bond_name = str(row[1]).strip() if row[1] else None
                scheduled_date_raw = row[2]
                cf_type = str(row[3]).strip().lower() if row[3] else None
                actual_paid_date_raw = row[5]
                actual_amount = float(row[6]) if row[6] else None
                notes = str(row[7]).strip() if row[7] else None
                
                # Validate required fields
                if not all([client_pan, bond_name, scheduled_date_raw, cf_type, actual_paid_date_raw, actual_amount]):
                    results["errors"].append(f"Row {row_num}: Missing required fields")
                    results["failed"] += 1
                    continue
                
                if cf_type not in ['interest', 'principal']:
                    results["errors"].append(f"Row {row_num}: Type must be 'interest' or 'principal'")
                    results["failed"] += 1
                    continue
                
                # Parse dates
                if isinstance(scheduled_date_raw, datetime):
                    scheduled_date = scheduled_date_raw
                else:
                    try:
                        scheduled_date = datetime.strptime(str(scheduled_date_raw), "%d-%m-%Y")
                    except:
                        try:
                            scheduled_date = datetime.strptime(str(scheduled_date_raw), "%Y-%m-%d")
                        except:
                            results["errors"].append(f"Row {row_num}: Invalid scheduled date format")
                            results["failed"] += 1
                            continue
                
                if isinstance(actual_paid_date_raw, datetime):
                    actual_paid_date = actual_paid_date_raw
                else:
                    try:
                        actual_paid_date = datetime.strptime(str(actual_paid_date_raw), "%d-%m-%Y")
                    except:
                        try:
                            actual_paid_date = datetime.strptime(str(actual_paid_date_raw), "%Y-%m-%d")
                        except:
                            results["errors"].append(f"Row {row_num}: Invalid actual paid date format")
                            results["failed"] += 1
                            continue
                
                # Find client
                client = await db.clients.find_one({"pan_number": client_pan})
                if not client:
                    results["errors"].append(f"Row {row_num}: Client with PAN {client_pan} not found")
                    results["failed"] += 1
                    continue
                
                # Verify access
                if current_user['role'] == 'broker':
                    if client.get('created_by') != current_user['id']:
                        results["errors"].append(f"Row {row_num}: Access denied for client {client_pan}")
                        results["failed"] += 1
                        continue
                else:
                    if client.get('linked_subbroker_id') != current_user['id']:
                        results["errors"].append(f"Row {row_num}: Access denied for client {client_pan}")
                        results["failed"] += 1
                        continue
                
                # Find matching cashflow - use date range for matching (same day)
                scheduled_date_str = scheduled_date.strftime("%Y-%m-%d")
                
                cashflow = await db.holding_cashflows.find_one({
                    "client_id": client['id'],
                    "bond_name": {"$regex": f"^{bond_name}$", "$options": "i"},
                    "date": {"$regex": f"^{scheduled_date_str}"},
                    "type": cf_type
                })
                
                if not cashflow:
                    results["errors"].append(f"Row {row_num}: No matching cashflow found for {client_pan}, {bond_name}, {scheduled_date_str}, {cf_type}")
                    results["failed"] += 1
                    continue
                
                # Detect prepayment
                is_prepaid = actual_paid_date.date() < scheduled_date.date()
                days_early = (scheduled_date.date() - actual_paid_date.date()).days if is_prepaid else 0
                
                # Update cashflow
                update_data = {
                    "is_repaid": True,
                    "repaid_date": actual_paid_date.isoformat(),
                    "repaid_actual_amount": actual_amount,
                    "is_prepaid": is_prepaid,
                    "days_early": days_early,
                    "notes": notes,
                    "marked_by": current_user['id'],
                    "marked_at": datetime.now(timezone.utc).isoformat(),
                    "bulk_uploaded": True
                }
                
                await db.holding_cashflows.update_one(
                    {"id": cashflow['id']},
                    {"$set": update_data}
                )
                
                results["success"] += 1
                if is_prepaid:
                    results["prepaid"] += 1
                
            except Exception as e:
                results["errors"].append(f"Row {row_num}: {str(e)}")
                results["failed"] += 1
        
        return {
            "message": f"Processed {results['success'] + results['failed']} entries",
            "success_count": results["success"],
            "failed_count": results["failed"],
            "prepaid_count": results["prepaid"],
            "errors": results["errors"][:20]  # Limit errors to first 20
        }
        
    except Exception as e:
        logger.error(f"Error processing bulk repayment upload: {e}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")


@api_router.post("/holdings/client/{client_id}/send-report-email")
async def send_holdings_report_email_endpoint(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Send holdings report email to client with sub-broker CC.
    Broker or sub-broker can trigger this for their clients.
    """
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can send reports")
    
    # Verify client access
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] == 'sub_broker':
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Get client email
    client_email = client.get('email')
    if not client_email:
        raise HTTPException(status_code=400, detail="Client has no email address")
    
    # Get sub-broker email for CC
    cc_emails = []
    if client.get('linked_subbroker_id'):
        sub_broker = await db.sub_brokers.find_one({"id": client.get('linked_subbroker_id')}, {"_id": 0})
        if sub_broker and sub_broker.get('email'):
            cc_emails.append(sub_broker.get('email'))
    
    # If current user is broker, also try to CC them
    if current_user['role'] == 'broker' and current_user.get('email'):
        if current_user.get('email') not in cc_emails:
            cc_emails.append(current_user.get('email'))
    
    # Get client holdings
    trades = await db.trades.find(
        {"client_id": client_id, "status": "approved"},
        {"_id": 0}
    ).to_list(1000)
    
    if not trades:
        raise HTTPException(status_code=404, detail="No approved trades found for this client")
    
    # Get bonds for each trade
    bond_ids = list(set(t.get('bond_id') for t in trades if t.get('bond_id')))
    bonds = await db.bonds.find({"id": {"$in": bond_ids}}, {"_id": 0}).to_list(len(bond_ids))
    bond_lookup = {b['id']: b for b in bonds}
    
    # Aggregate holdings by bond
    holdings_by_bond = {}
    for trade in trades:
        bond_id = trade.get('bond_id')
        if bond_id not in holdings_by_bond:
            bond = bond_lookup.get(bond_id, {})
            holdings_by_bond[bond_id] = {
                'bond_name': trade.get('bond_name') or bond.get('name', 'Unknown'),
                'units': 0,
                'invested_amount': 0,
                'gross_expected': 0,
                'profit': 0,
                'expected_xirr': trade.get('xirr'),
                'actual_xirr': trade.get('actual_xirr')
            }
        holdings_by_bond[bond_id]['units'] += trade.get('units', 0)
        holdings_by_bond[bond_id]['invested_amount'] += trade.get('total_amount', 0)
    
    # Get cashflows for calculating expected returns
    all_cashflows = await db.holding_cashflows.find(
        {"client_id": client_id, "type": {"$ne": "investment"}},
        {"_id": 0}
    ).to_list(10000)
    
    # Sum cashflows by bond
    for cf in all_cashflows:
        bond_id = cf.get('bond_id')
        if bond_id in holdings_by_bond:
            holdings_by_bond[bond_id]['gross_expected'] += cf.get('gross_amount', 0)
    
    # Calculate profits
    holdings_data = []
    total_invested = 0
    total_expected = 0
    total_profit = 0
    
    for bond_id, h in holdings_by_bond.items():
        h['profit'] = h['gross_expected'] - h['invested_amount']
        h['expected_xirr'] = round(h['expected_xirr'], 2) if h['expected_xirr'] else '-'
        h['actual_xirr'] = round(h['actual_xirr'], 2) if h['actual_xirr'] else '-'
        holdings_data.append(h)
        total_invested += h['invested_amount']
        total_expected += h['gross_expected']
        total_profit += h['profit']
    
    # Send email
    email_sent = send_holdings_report_email(
        client_name=client.get('name', 'Valued Investor'),
        client_email=client_email,
        holdings_data=holdings_data,
        total_invested=total_invested,
        total_expected=total_expected,
        total_profit=total_profit,
        cc_emails=cc_emails if cc_emails else None
    )
    
    if email_sent:
        return {
            "success": True,
            "message": f"Holdings report sent to {client_email}" + (f" with CC to {', '.join(cc_emails)}" if cc_emails else ""),
            "recipient": client_email,
            "cc": cc_emails
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to send email. Please check email configuration.")


@api_router.get("/holdings/export-cashflows/{client_id}")
async def export_client_cashflows(client_id: str, current_user: dict = Depends(get_current_user)):
    """Export all cashflows for a client to Excel (for updating repayments)"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    # Verify client access
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] == 'sub_broker':
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Get all cashflows for this client
    cashflows = await db.holding_cashflows.find(
        {"client_id": client_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not cashflows:
        raise HTTPException(status_code=404, detail="No cashflows found for this client")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Cashflows"
    
    # Header style
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    prepaid_fill = PatternFill(start_color="BDD7EE", end_color="BDD7EE", fill_type="solid")
    repaid_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    
    # Headers
    headers = [
        "Client PAN", "Bond Name", "Scheduled Date", "Type",
        "Expected Amount", "Actual Paid Date", "Actual Amount Received", 
        "Status", "Prepaid", "Days Early", "Notes"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    for row_num, cf in enumerate(cashflows, 2):
        ws.cell(row=row_num, column=1, value=client['pan_number'])
        ws.cell(row=row_num, column=2, value=cf.get('bond_name', ''))
        
        # Format scheduled date
        scheduled_date = cf.get('date', '')
        if scheduled_date:
            try:
                dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
                scheduled_date = dt.strftime("%d-%m-%Y")
            except:
                pass
        ws.cell(row=row_num, column=3, value=scheduled_date)
        
        ws.cell(row=row_num, column=4, value=cf.get('type', ''))
        ws.cell(row=row_num, column=5, value=cf.get('net_amount', 0))
        
        # Format actual paid date
        repaid_date = cf.get('repaid_date', '')
        if repaid_date:
            try:
                dt = datetime.fromisoformat(repaid_date.replace('Z', '+00:00'))
                repaid_date = dt.strftime("%d-%m-%Y")
            except:
                pass
        ws.cell(row=row_num, column=6, value=repaid_date or '')
        
        ws.cell(row=row_num, column=7, value=cf.get('repaid_actual_amount', '') or '')
        ws.cell(row=row_num, column=8, value='Repaid' if cf.get('is_repaid') else 'Pending')
        ws.cell(row=row_num, column=9, value='Yes' if cf.get('is_prepaid') else 'No')
        ws.cell(row=row_num, column=10, value=cf.get('days_early', 0) or 0)
        ws.cell(row=row_num, column=11, value=cf.get('notes', '') or '')
        
        # Highlight prepaid and repaid rows
        if cf.get('is_prepaid'):
            for col in range(1, 12):
                ws.cell(row=row_num, column=col).fill = prepaid_fill
        elif cf.get('is_repaid'):
            for col in range(1, 12):
                ws.cell(row=row_num, column=col).fill = repaid_fill
    
    # Set column widths
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 35
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 12
    ws.column_dimensions['E'].width = 18
    ws.column_dimensions['F'].width = 18
    ws.column_dimensions['G'].width = 22
    ws.column_dimensions['H'].width = 12
    ws.column_dimensions['I'].width = 10
    ws.column_dimensions['J'].width = 12
    ws.column_dimensions['K'].width = 30
    
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cashflows_{client['pan_number']}.xlsx"}
    )


# ==================== REINVESTMENT TAGGING ====================

class ReinvestmentTagUpdate(BaseModel):
    reinvestment_tag: str
    custom_amount: Optional[float] = None  # "not_tagged", "principal", "interest", "net_amount", "not_invest"
    send_approval_email: bool = False  # Whether to send approval email to client
    portfolio_category: Optional[str] = None  # "wealth", "tax", "short_term", "commodities", "retirement", "children_education"
    target_ucc: Optional[str] = None  # Target UCC for reinvestment


class ReinvestmentApproval(BaseModel):
    approved: bool
    notes: Optional[str] = None


class SendReinvestmentApprovalRequest(BaseModel):
    client_id: str
    cashflow_ids: List[str]


@api_router.get("/reinvestment/upcoming")
async def get_upcoming_reinvestments(current_user: dict = Depends(get_current_user)):
    """Get upcoming repayments for the next 6 months for reinvestment tagging"""
    
    # First, ensure all approved trades have cashflows generated
    all_trades = await db.trades.find({"status": "approved"}, {"_id": 0}).to_list(10000)
    
    for trade in all_trades:
        # Check if cashflows exist for this trade
        existing = await db.holding_cashflows.find_one({"trade_id": trade['id']})
        if not existing:
            # Generate and store cashflows
            bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
            if bond:
                cashflows = generate_client_cashflows(trade, bond)
                if cashflows:
                    for cf in cashflows:
                        cf['client_id'] = trade['client_id']
                        cf['bond_id'] = trade['bond_id']
                        cf['bond_name'] = trade.get('bond_name', bond.get('issuer', ''))
                    await db.holding_cashflows.insert_many(cashflows)
    
    # Get all cashflows that are not repaid and in the next 6 months
    today = datetime.now(timezone.utc).date()
    six_months_later = today + timedelta(days=180)
    
    # Get all holding cashflows
    # Include: 
    # 1. All untagged cashflows (past and future, regardless of is_repaid status)
    # 2. All tagged cashflows (for the Tagged section)
    cashflows = await db.holding_cashflows.find({}, {"_id": 0}).to_list(10000)
    
    # Filter by date and group by month
    # Include ALL untagged cashflows (past and future) plus tagged cashflows within 6 months
    upcoming = []
    for cf in cashflows:
        try:
            cf_date = datetime.fromisoformat(cf['date']).date()
            reinvestment_tag = cf.get('reinvestment_tag', 'not_tagged')
            
            # Include ALL cashflows - both past and future, tagged and untagged
            # Frontend will filter and categorize them
            
            # Get client details including ucc_list
            client = await db.clients.find_one({"id": cf['client_id']}, {"_id": 0, "name": 1, "pan_number": 1, "email": 1, "ucc_list": 1, "ucc": 1})
            
            # Get trade details
            trade = await db.trades.find_one({"id": cf['trade_id']}, {"_id": 0})
            
            # Check access based on role
            if current_user['role'] == 'broker':
                if not (client and trade):
                    continue  # Skip if missing data
            else:
                # Sub-broker can only see their linked clients
                if not client or client.get('linked_subbroker_id') != current_user['id']:
                    continue
            
            # Get bond_code from trade or bond document
            bond_code = trade.get('bond_code', '') if trade else ''
            if not bond_code and cf.get('bond_id'):
                bond = await db.bonds.find_one({"id": cf['bond_id']}, {"_id": 0, "bond_code": 1})
                bond_code = bond.get('bond_code', '') if bond else ''
            
            # Get client's UCC list (handle both old single ucc and new ucc_list)
            client_ucc_list = client.get('ucc_list', []) if client else []
            if not client_ucc_list and client and client.get('ucc'):
                client_ucc_list = [client.get('ucc')]  # Convert old single UCC to list
            
            upcoming.append({
                "cashflow_id": cf['id'],
                "client_id": cf['client_id'],
                "client_name": client['name'] if client else 'Unknown',
                "client_pan": client.get('pan_number', '') if client else '',
                "client_email": client.get('email', '') if client else '',
                "client_ucc_list": client_ucc_list,  # Client's available UCCs for reinvestment
                "bond_id": cf['bond_id'],
                "bond_name": cf.get('bond_name', ''),
                "bond_code": bond_code,  # Added bond_code (Deal ID)
                "trade_id": cf['trade_id'],
                "amount_invested": trade.get('total_amount', 0) if trade else 0,
                "units": trade.get('units', 0) if trade else 0,
                "expected_date": cf['date'],
                "principal_net": cf.get('principal_component', 0),
                "interest_net": cf.get('interest_component', 0) - cf.get('tds_amount', 0),
                "net_amount": cf.get('net_amount', 0),
                "reinvestment_tag": cf.get('reinvestment_tag', 'not_tagged'),
                "custom_amount": cf.get('custom_amount'),
                "portfolio_category": cf.get('portfolio_category'),
                "target_ucc": cf.get('target_ucc'),  # Selected UCC for reinvestment
                "approval_status": cf.get('approval_status', 'not_sent'),  # not_sent, pending, approved, rejected
                "client_approved": cf.get('client_approved', False),
                "tagged_at": cf.get('tagged_at'),
                "month": cf_date.strftime("%B %Y"),
                "is_past_date": cf_date < today,  # True if date has passed - no client approval needed
                # Prepayment-related fields
                "is_amended": cf.get('is_amended', False),
                "prepayment_affected": cf.get('prepayment_affected', False),
                "reinvestment_tag_needs_update": cf.get('reinvestment_tag_needs_update', False),
                "original_net_amount": cf.get('original_net_amount'),
                "original_interest_component": cf.get('original_interest_component'),
                "amendment_reason": cf.get('amendment_reason', '')
            })
        except (ValueError, TypeError):
            continue
    
    # Sort by date
    upcoming.sort(key=lambda x: x['expected_date'])
    
    # Group by month
    months = {}
    for item in upcoming:
        month = item['month']
        if month not in months:
            months[month] = []
        months[month].append(item)
    
    # Group by client for client-wise view
    by_client = {}
    for item in upcoming:
        client_id = item['client_id']
        if client_id not in by_client:
            by_client[client_id] = {
                "client_id": client_id,
                "client_name": item['client_name'],
                "client_pan": item['client_pan'],
                "client_email": item['client_email'],
                "entries": [],
                "total_amount": 0,
                "tagged_count": 0,
                "pending_approval": 0,
                "approved_count": 0
            }
        by_client[client_id]['entries'].append(item)
        by_client[client_id]['total_amount'] += item['net_amount']
        if item['reinvestment_tag'] != 'not_tagged':
            by_client[client_id]['tagged_count'] += 1
        if item['approval_status'] == 'pending':
            by_client[client_id]['pending_approval'] += 1
        if item['client_approved']:
            by_client[client_id]['approved_count'] += 1
    
    # Generate next 6 months list plus include all past months from the data
    month_list = []
    
    # First, collect all unique months from the data (including past)
    all_months_data = []
    for month_name, items in months.items():
        all_months_data.append({
            "name": month_name,
            "items": items,
            "count": len(items)
        })
    
    # Sort by date (parsing month name)
    from calendar import month_name as cal_month_names
    def parse_month_key(month_str):
        parts = month_str.split(' ')
        month_idx = list(cal_month_names).index(parts[0])
        year = int(parts[1])
        return year * 12 + month_idx
    
    all_months_data.sort(key=lambda x: parse_month_key(x['name']))
    month_list = all_months_data
    
    # Also ensure next 6 months are included even if empty
    current_date = today.replace(day=1)
    existing_month_names = {m['name'] for m in month_list}
    for i in range(6):
        month_name = current_date.strftime("%B %Y")
        if month_name not in existing_month_names:
            month_list.append({
                "name": month_name,
                "items": [],
                "count": 0
            })
        if current_date.month == 12:
            current_date = current_date.replace(year=current_date.year + 1, month=1)
        else:
            current_date = current_date.replace(month=current_date.month + 1)
    
    # Re-sort after adding empty months
    month_list.sort(key=lambda x: parse_month_key(x['name']))
    
    return {
        "months": month_list,
        "by_client": list(by_client.values()),
        "total_upcoming": len(upcoming)
    }


@api_router.put("/reinvestment/tag/{cashflow_id}")
async def update_reinvestment_tag(cashflow_id: str, update: ReinvestmentTagUpdate, current_user: dict = Depends(get_current_user)):
    """Update reinvestment tag for a cashflow"""
    
    # Find the cashflow
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow not found")
    
    # Verify access
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check if already approved by client - cannot modify
    if cashflow.get('client_approved') and current_user['role'] != 'client':
        raise HTTPException(status_code=400, detail="Cannot modify client-approved tags")
    
    if current_user['role'] == 'client':
        # Client can only modify their own cashflows
        if client.get('user_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] != 'broker':
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Update tag - reset approval status if broker/sub-broker modifies
    update_data = {
        "reinvestment_tag": update.reinvestment_tag,
        "tagged_by": current_user['id'],
        "tagged_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Handle custom amount for "other" tag
    if update.reinvestment_tag == 'other' and update.custom_amount is not None:
        update_data['custom_amount'] = update.custom_amount
    elif update.reinvestment_tag != 'other':
        # Clear custom amount if not "other"
        update_data['custom_amount'] = None
    
    # Handle portfolio category
    if update.portfolio_category:
        update_data['portfolio_category'] = update.portfolio_category
    elif update.reinvestment_tag in ['not_tagged', 'not_invest']:
        # Clear portfolio category if not investing
        update_data['portfolio_category'] = None
    
    # Handle target UCC for reinvestment
    if update.target_ucc:
        # Validate that the UCC belongs to the client
        client_ucc_list = client.get('ucc_list', [])
        if not client_ucc_list and client.get('ucc'):
            client_ucc_list = [client.get('ucc')]
        if update.target_ucc.upper() not in [u.upper() for u in client_ucc_list]:
            raise HTTPException(status_code=400, detail=f"UCC '{update.target_ucc}' does not belong to this client")
        update_data['target_ucc'] = update.target_ucc.upper()
    elif update.reinvestment_tag in ['not_tagged', 'not_invest']:
        # Clear target UCC if not investing
        update_data['target_ucc'] = None
    
    # Check if this is a past date or future date
    today = datetime.now(timezone.utc).date()
    cf_date = datetime.fromisoformat(cashflow['date']).date()
    is_past_date = cf_date < today
    
    # If broker/sub-broker is tagging:
    # - Past dates: Auto-approve (no client approval needed)
    # - Future dates: Set to pending approval
    if current_user['role'] in ['broker', 'sub_broker'] and update.reinvestment_tag not in ['not_tagged']:
        if is_past_date:
            # Past date - auto approve, no client approval needed
            update_data['client_approved'] = True
            update_data['approval_status'] = 'approved'
            update_data['approved_at'] = datetime.now(timezone.utc).isoformat()
            update_data['approved_by'] = current_user['id']
            update_data['auto_approved'] = True  # Mark as auto-approved for past dates
        else:
            # Future date - requires client approval
            update_data['client_approved'] = False
            update_data['approval_status'] = 'pending'
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": update_data}
    )
    
    # Create a log entry for Reinvestment Approvals tab
    log_entry = {
        "id": str(uuid.uuid4()),
        "type": "reinvestment_tag",
        "cashflow_id": cashflow_id,
        "client_id": cashflow['client_id'],
        "client_name": client.get('name', ''),
        "bond_id": cashflow.get('bond_id'),
        "bond_name": cashflow.get('bond_name', ''),
        "expected_date": cashflow['date'],
        "net_amount": cashflow.get('net_amount', 0),
        "reinvestment_tag": update.reinvestment_tag,
        "portfolio_category": update.portfolio_category,
        "target_ucc": update.target_ucc,
        "tagged_by": current_user['id'],
        "tagged_by_name": current_user.get('name', ''),
        "is_past_date": is_past_date,
        "approval_status": update_data.get('approval_status', 'pending'),
        "client_approved": update_data.get('client_approved', False),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.reinvestment_logs.insert_one(log_entry)
    
    return {
        "message": "Tag updated successfully" + (" (auto-approved for past date)" if is_past_date else " (pending client approval)"), 
        "reinvestment_tag": update.reinvestment_tag, 
        "custom_amount": update.custom_amount,
        "portfolio_category": update.portfolio_category,
        "target_ucc": update.target_ucc,
        "is_past_date": is_past_date,
        "approval_status": update_data.get('approval_status')
    }


@api_router.put("/reinvestment/approve/{cashflow_id}")
async def approve_reinvestment_tag(cashflow_id: str, approval: ReinvestmentApproval, current_user: dict = Depends(get_current_user)):
    """Client approves or rejects reinvestment tag"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can approve reinvestment tags")
    
    # Find the cashflow
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow not found")
    
    # Verify this is client's own cashflow
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client or client.get('user_id') != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update approval status
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": {
            "client_approved": approval.approved,
            "approval_status": "approved" if approval.approved else "rejected",
            "approval_notes": approval.notes,
            "approved_by": current_user['id'],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create notification for broker/sub-broker
    notification = {
        "id": str(uuid.uuid4()),
        "type": "reinvestment_approval",
        "client_id": client['id'],
        "client_name": client['name'],
        "cashflow_id": cashflow_id,
        "approved": approval.approved,
        "notes": approval.notes,
        "for_user_id": client.get('linked_subbroker_id') or client.get('created_by'),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False
    }
    await db.notifications.insert_one(notification)
    
    # If approved, call the Kinntegra MF Buy Scheduler API
    kinntegra_result = None
    if approval.approved:
        try:
            kinntegra_result = await call_kinntegra_mf_buy_scheduler(cashflow, client)
        except Exception as e:
            logger.error(f"Error calling Kinntegra API: {e}")
            kinntegra_result = {"status": "error", "message": str(e)}
    
    return {
        "message": f"Tag {'approved' if approval.approved else 'rejected'} successfully",
        "kinntegra_api_result": kinntegra_result
    }


@api_router.get("/reinvestment/logs")
async def get_reinvestment_logs(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get reinvestment tagging logs for the Logs > Reinvestment Approvals tab"""
    query = {}
    
    if status:
        query["approval_status"] = status
    if client_id:
        query["client_id"] = client_id
    
    # Sub-brokers can only see their clients' logs
    if current_user['role'] == 'sub_broker':
        # Get sub-broker's client IDs
        clients = await db.clients.find(
            {"linked_subbroker_id": current_user['id']}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        client_ids = [c['id'] for c in clients]
        query["client_id"] = {"$in": client_ids}
    
    logs = await db.reinvestment_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return logs


@api_router.post("/reinvestment/send-approval-email")
async def send_reinvestment_approval_email(
    request: SendReinvestmentApprovalRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Send approval email to client for tagged reinvestments"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers can send approval emails")
    
    # Get client
    client = await db.clients.find_one({"id": request.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get user email
    user = await db.users.find_one({"id": client.get('user_id')})
    client_email = user.get('email') if user else client.get('email')
    
    if not client_email:
        raise HTTPException(status_code=400, detail="Client does not have an email address")
    
    # Get cashflows
    cashflows = await db.holding_cashflows.find(
        {"id": {"$in": request.cashflow_ids}}
    ).to_list(1000)
    
    if not cashflows:
        raise HTTPException(status_code=404, detail="No cashflows found")
    
    # Build email content
    entries_html = ""
    total_amount = 0
    for cf in cashflows:
        tag = cf.get('reinvestment_tag', 'not_tagged')
        if tag == 'other':
            amount = cf.get('custom_amount', 0)
        elif tag == 'principal':
            amount = cf.get('principal_component', 0)
        elif tag == 'interest':
            amount = cf.get('interest_component', 0) - cf.get('tds_amount', 0)
        elif tag == 'net_amount':
            amount = cf.get('net_amount', 0)
        else:
            amount = 0
        
        total_amount += amount
        entries_html += f"""
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">{cf.get('bond_name', 'N/A')}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{cf.get('date', 'N/A')}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{tag.replace('_', ' ').title()}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₹{amount:,.2f}</td>
        </tr>
        """
    
    # Generate approval token
    approval_token = create_access_token(
        data={"client_id": client['id'], "cashflow_ids": request.cashflow_ids, "type": "reinvestment_approval"},
        expires_delta=timedelta(days=7)
    )
    
    # Update cashflows with pending status
    await db.holding_cashflows.update_many(
        {"id": {"$in": request.cashflow_ids}},
        {"$set": {
            "approval_status": "pending",
            "approval_email_sent": True,
            "approval_email_sent_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Send email (using the configured SMTP)
    try:
        from email_service import send_reinvestment_approval_email as send_approval_email
        background_tasks.add_task(
            send_approval_email,
            client_email,
            client['name'],
            entries_html,
            total_amount,
            approval_token,
            len(cashflows)
        )
    except Exception as e:
        logger.error(f"Error sending approval email: {e}")
        # Still return success as the status was updated
    
    return {
        "message": f"Approval email sent to {client_email}",
        "cashflows_count": len(cashflows),
        "total_amount": total_amount
    }


@api_router.get("/reinvestment/approve-via-link")
async def approve_reinvestment_via_link(token: str, action: str = "approve"):
    """Handle approval/rejection via email link"""
    try:
        payload = verify_token(token)
        if not payload or payload.get("type") != "reinvestment_approval":
            raise HTTPException(status_code=400, detail="Invalid or expired approval link")
        
        client_id = payload.get("client_id")
        cashflow_ids = payload.get("cashflow_ids", [])
        
        approved = action.lower() == "approve"
        
        # Update all cashflows
        await db.holding_cashflows.update_many(
            {"id": {"$in": cashflow_ids}},
            {"$set": {
                "client_approved": approved,
                "approval_status": "approved" if approved else "rejected",
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # If approved, trigger Kinntegraa API (placeholder)
        if approved:
            # Get approved cashflows for API submission
            cashflows = await db.holding_cashflows.find(
                {"id": {"$in": cashflow_ids}}
            ).to_list(1000)
            
            # TODO: Implement Kinntegraa API integration
            # For now, store the submission request
            submission = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "cashflow_ids": cashflow_ids,
                "status": "pending_submission",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.kinntegraa_submissions.insert_one(submission)
        
        return {
            "message": f"Reinvestment {'approved' if approved else 'rejected'} successfully",
            "action": action,
            "cashflows_count": len(cashflow_ids)
        }
    except Exception as e:
        logger.error(f"Error in approval link: {e}")
        raise HTTPException(status_code=400, detail="Invalid or expired approval link")


@api_router.post("/reinvestment/submit-to-kinntegraa")
async def submit_to_kinntegraa(
    submission_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Submit approved reinvestments to Kinntegraa API"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can submit to Kinntegraa")
    
    # Get pending submissions
    query = {"status": "pending_submission"}
    if submission_id:
        query["id"] = submission_id
    
    submissions = await db.kinntegraa_submissions.find(query).to_list(100)
    
    if not submissions:
        raise HTTPException(status_code=404, detail="No pending submissions found")
    
    results = []
    for submission in submissions:
        try:
            # Get cashflows
            cashflows = await db.holding_cashflows.find(
                {"id": {"$in": submission['cashflow_ids']}}
            ).to_list(1000)
            
            # Get client
            client = await db.clients.find_one({"id": submission['client_id']})
            
            # Prepare API payload (structure to be confirmed with Kinntegraa)
            api_payload = {
                "client_pan": client.get('pan_number', '') if client else '',
                "client_name": client.get('name', '') if client else '',
                "client_email": client.get('email', '') if client else '',
                "reinvestments": []
            }
            
            for cf in cashflows:
                tag = cf.get('reinvestment_tag', 'not_tagged')
                if tag == 'other':
                    amount = cf.get('custom_amount', 0)
                elif tag == 'principal':
                    amount = cf.get('principal_component', 0)
                elif tag == 'interest':
                    amount = cf.get('interest_component', 0) - cf.get('tds_amount', 0)
                elif tag == 'net_amount':
                    amount = cf.get('net_amount', 0)
                else:
                    continue
                
                api_payload["reinvestments"].append({
                    "bond_name": cf.get('bond_name', ''),
                    "expected_date": cf.get('date', ''),
                    "amount": amount,
                    "tag_type": tag
                })
            
            # TODO: Make actual API call to Kinntegraa
            # response = await httpx.post("https://api.kinntegraa.com/reinvestments", json=api_payload)
            
            # For now, mark as submitted
            await db.kinntegraa_submissions.update_one(
                {"id": submission['id']},
                {"$set": {
                    "status": "submitted",
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                    "api_payload": api_payload
                }}
            )
            
            results.append({
                "submission_id": submission['id'],
                "status": "submitted",
                "cashflows_count": len(cashflows)
            })
            
        except Exception as e:
            logger.error(f"Error submitting to Kinntegraa: {e}")
            results.append({
                "submission_id": submission['id'],
                "status": "error",
                "error": str(e)
            })
    
    return {"results": results}


@api_router.get("/reinvestment-logs")
async def get_reinvestment_logs(
    client_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get reinvestment logs, optionally filtered by client_id"""
    query = {}
    
    if current_user['role'] == 'broker':
        # Broker can see all logs
        if client_id:
            query['client_id'] = client_id
    elif current_user['role'] == 'sub_broker':
        # Sub-broker can only see logs for their clients
        partner = await db.partners.find_one({"user_id": current_user['id']}, {"_id": 0})
        if partner:
            linked_clients = await db.clients.find(
                {"linked_subbroker_id": partner['id']},
                {"_id": 0, "id": 1}
            ).to_list(1000)
            client_ids = [c['id'] for c in linked_clients]
            if client_id and client_id in client_ids:
                query['client_id'] = client_id
            else:
                query['client_id'] = {'$in': client_ids}
    elif current_user['role'] == 'client':
        # Client can only see their own logs
        client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
        if client:
            query['client_id'] = client['id']
    
    logs = await db.reinvestment_logs.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    return logs


# ==================== END REINVESTMENT TAGGING ====================


# ==================== CLIENT PORTAL ====================

class ClientVerifyProfile(BaseModel):
    verified: bool


class ClientChangePassword(BaseModel):
    current_password: str
    new_password: str
    new_pin: str


@api_router.get("/client/verify/{token}")
async def get_client_verification_details(token: str):
    """Get client details for verification (no auth required)"""
    
    client = await db.clients.find_one({"verification_token": token}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Invalid verification token")
    
    if client.get('verification_status') == 'verified':
        raise HTTPException(status_code=400, detail="Profile already verified")
    
    # Get broker details
    broker = await db.users.find_one({"id": client['created_by']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    
    # Get sub-broker details if linked
    subbroker = None
    if client.get('linked_subbroker_id'):
        subbroker = await db.users.find_one({"id": client['linked_subbroker_id']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    
    return {
        "client": client,
        "broker": broker,
        "subbroker": subbroker
    }


@api_router.post("/client/verify/{token}")
async def verify_client_profile(token: str, verify: ClientVerifyProfile):
    """Client verifies their profile details"""
    
    client = await db.clients.find_one({"verification_token": token})
    if not client:
        raise HTTPException(status_code=404, detail="Invalid verification token")
    
    if client.get('verification_status') == 'verified':
        raise HTTPException(status_code=400, detail="Profile already verified")
    
    if not verify.verified:
        # Client rejected - notify broker
        notification = {
            "id": str(uuid.uuid4()),
            "type": "client_verification_rejected",
            "client_id": client['id'],
            "client_name": client['name'],
            "for_user_id": client['created_by'],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False
        }
        await db.notifications.insert_one(notification)
        return {"message": "Verification rejected. Broker has been notified."}
    
    # Activate the user account
    await db.users.update_one(
        {"id": client['user_id']},
        {"$set": {"is_active": True}}
    )
    
    # Update client verification status
    await db.clients.update_one(
        {"id": client['id']},
        {"$set": {
            "verification_status": "verified",
            "verified_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get default credentials
    default_password = client['pan_number'][-4:] + "1234"
    
    return {
        "message": "Profile verified successfully",
        "credentials": {
            "pan": client['pan_number'],
            "default_password": default_password,
            "default_pin": "1234",
            "note": "Please change your password and PIN after first login"
        }
    }


@api_router.get("/client/profile")
async def get_client_profile(current_user: dict = Depends(get_current_user)):
    """Get client's own profile with broker/sub-broker details"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Get broker details
    broker = await db.users.find_one({"id": client['created_by']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    
    # Get sub-broker details if linked
    subbroker = None
    if client.get('linked_subbroker_id'):
        subbroker = await db.users.find_one({"id": client['linked_subbroker_id']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
        # Also get partner record for more details
        partner = await db.partners.find_one({"id": client['linked_subbroker_id']}, {"_id": 0})
        if partner and subbroker:
            subbroker['partner_details'] = partner
    
    return {
        "client": client,
        "broker": broker,
        "subbroker": subbroker
    }


@api_router.get("/client/opportunities")
async def get_client_opportunities(current_user: dict = Depends(get_current_user)):
    """Get available bonds for client"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get all available bonds
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate status for each bond
    today = datetime.now(timezone.utc).date()
    available_bonds = []
    
    for bond in bonds:
        try:
            end_date = datetime.strptime(bond.get('end_date', ''), '%Y-%m-%d').date()
            units_remaining = bond.get('total_units', 0) - bond.get('units_sold', 0)
            
            if end_date > today and units_remaining > 0:
                bond['status'] = 'available'
                bond['units_remaining'] = units_remaining
                available_bonds.append(bond)
        except (ValueError, TypeError):
            continue
    
    return available_bonds


@api_router.get("/client/holdings")
async def get_client_own_holdings(current_user: dict = Depends(get_current_user)):
    """Get client's own holdings"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Reuse existing holdings endpoint logic
    return await get_client_holdings(client['id'], current_user)


@api_router.get("/client/trades")
async def get_client_trades(current_user: dict = Depends(get_current_user)):
    """Get client's own trades"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Get trades for this client
    trades = await db.trades.find({"client_id": client['id']}, {"_id": 0}).to_list(1000)
    
    # Enrich with bond details
    for trade in trades:
        bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0, "name": 1})
        trade['bond_name'] = bond['name'] if bond else 'Unknown'
    
    return trades


@api_router.get("/client/reinvestment")
async def get_client_reinvestment_tags(current_user: dict = Depends(get_current_user)):
    """Get reinvestment tags pending client approval"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Get pending approvals
    pending = await db.holding_cashflows.find({
        "client_id": client['id'],
        "reinvestment_tag": {"$nin": ["not_tagged", None]},
        "approval_status": "pending"
    }, {"_id": 0}).to_list(1000)
    
    # Get approved
    approved = await db.holding_cashflows.find({
        "client_id": client['id'],
        "approval_status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    # Get rejected
    rejected = await db.holding_cashflows.find({
        "client_id": client['id'],
        "approval_status": "rejected"
    }, {"_id": 0}).to_list(1000)
    
    # Enrich with bond details
    for items in [pending, approved, rejected]:
        for cf in items:
            bond = await db.bonds.find_one({"id": cf['bond_id']}, {"_id": 0, "name": 1})
            cf['bond_name'] = bond['name'] if bond else 'Unknown'
    
    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected
    }


@api_router.post("/client/trades")
async def create_client_trade(trade_data: TradeCreate, current_user: dict = Depends(get_current_user)):
    """Client books units for themselves"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can use this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Override client_id with the actual client's ID
    trade_data_dict = trade_data.model_dump()
    trade_data_dict['client_id'] = client['id']
    
    # Get bond
    bond = await db.bonds.find_one({"id": trade_data.bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check bond status
    today = datetime.now(timezone.utc).date()
    try:
        end_date = datetime.strptime(bond.get('end_date', ''), '%Y-%m-%d').date()
        units_remaining = bond.get('total_units', 0) - bond.get('units_sold', 0)
        
        if end_date <= today:
            raise HTTPException(status_code=400, detail="Bond has matured")
        if units_remaining <= 0:
            raise HTTPException(status_code=400, detail="No units available")
        if trade_data.units > units_remaining:
            raise HTTPException(status_code=400, detail=f"Only {units_remaining} units available")
    except (ValueError, TypeError):
        pass
    
    # Create trade (pending approval like sub-broker trades)
    trade_id = str(uuid.uuid4())
    trade = {
        "id": trade_id,
        "bond_id": trade_data.bond_id,
        "bond_name": bond['name'],
        "client_id": client['id'],
        "client_name": client['name'],
        "client_pan": client['pan_number'],
        "units": trade_data.units,
        "calculated_price": trade_data.calculated_price,
        "total_amount": trade_data.total_amount,
        "investment_date": trade_data.investment_date,
        "payment_reference": trade_data.payment_reference,
        "payment_notes": trade_data.payment_notes,
        "payment_proof_filename": trade_data.payment_proof_filename,
        "status": "pending",  # Client trades require approval
        "created_by": current_user['id'],
        "created_by_name": client['name'],
        "created_by_role": "client",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.trades.insert_one(trade)
    
    # Notify sub-broker (or broker if no sub-broker)
    notify_user_id = client.get('linked_subbroker_id') or client.get('created_by')
    notification = {
        "id": str(uuid.uuid4()),
        "type": "client_trade_created",
        "trade_id": trade_id,
        "client_id": client['id'],
        "client_name": client['name'],
        "bond_name": bond['name'],
        "units": trade_data.units,
        "total_amount": trade_data.total_amount,
        "for_user_id": notify_user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False
    }
    await db.notifications.insert_one(notification)
    
    if '_id' in trade:
        del trade['_id']
    return trade


@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Get notifications for current user"""
    
    notifications = await db.notifications.find(
        {"for_user_id": current_user['id']},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return notifications


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark notification as read"""
    
    result = await db.notifications.update_one(
        {"id": notification_id, "for_user_id": current_user['id']},
        {"$set": {"read": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}


@api_router.get("/notifications/unread-count")
async def get_unread_notification_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread notifications"""
    
    count = await db.notifications.count_documents({
        "for_user_id": current_user['id'],
        "read": False
    })
    
    return {"count": count}


# ==================== END CLIENT PORTAL ====================


@api_router.get("/holdings/client/{client_id}/download")
async def download_client_holdings(client_id: str, current_user: dict = Depends(get_current_user)):
    """Generate Excel file for client holdings download with Expected and Actual cashflows"""
    
    # Get client holdings
    holdings_data = await get_client_holdings(client_id, current_user)
    
    # Create workbook
    wb = Workbook()
    
    # Styles
    header_font = Font(bold=True, size=11, color="FFFFFF")
    header_fill = PatternFill(start_color="92400E", end_color="92400E", fill_type="solid")
    expected_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")  # Blue
    actual_fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")  # Green
    investment_fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")  # Red for investment
    title_font = Font(bold=True, size=14)
    money_font = Font(name="Consolas", size=10)
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # ========== SUMMARY SHEET ==========
    ws_summary = wb.active
    ws_summary.title = "Summary"
    
    # Title
    ws_summary['A1'] = f"Holdings Report - {holdings_data['client']['name']}"
    ws_summary['A1'].font = title_font
    ws_summary.merge_cells('A1:H1')
    
    ws_summary['A2'] = f"PAN: {holdings_data['client']['pan_number']}"
    ws_summary['A3'] = f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC"
    
    # Summary stats
    ws_summary['A5'] = "SUMMARY"
    ws_summary['A5'].font = Font(bold=True, size=12)
    
    summary_data = [
        ("Total Investment", holdings_data['summary']['total_investment']),
        ("Total Repaid (Gross)", holdings_data['summary']['total_repaid']),
        ("Total Upcoming (Gross)", holdings_data['summary']['total_upcoming']),
        ("Total Expected (Gross)", holdings_data['summary']['total_expected']),
        ("Total Profit", holdings_data['summary']['total_profit'])
    ]
    
    for i, (label, value) in enumerate(summary_data):
        ws_summary[f'A{6+i}'] = label
        ws_summary[f'B{6+i}'] = value
        ws_summary[f'B{6+i}'].font = money_font
        ws_summary[f'B{6+i}'].number_format = '₹ #,##0.00'
    
    # Adjust column widths
    ws_summary.column_dimensions['A'].width = 22
    ws_summary.column_dimensions['B'].width = 18
    
    # ========== EXPECTED CASHFLOWS SHEET ==========
    ws_expected = wb.create_sheet(title="Expected Cashflows")
    
    ws_expected['A1'] = "EXPECTED CASHFLOWS"
    ws_expected['A1'].font = title_font
    ws_expected.merge_cells('A1:F1')
    
    # Headers for Expected
    expected_headers = ["Date", "Bond Name", "Type", "Principal", "Interest", "Gross Amount"]
    for col, header in enumerate(expected_headers, 1):
        cell = ws_expected.cell(row=3, column=col, value=header)
        cell.font = header_font
        cell.fill = expected_fill
        cell.border = border
        cell.alignment = Alignment(horizontal='center')
    
    row = 4
    total_exp_principal = 0
    total_exp_interest = 0
    total_exp_gross = 0
    
    for holding in holdings_data['holdings']:
        expected_cfs = holding.get('expected_cashflows', [])
        for cf in expected_cfs:
            is_investment = cf.get('type') == 'investment'
            ws_expected.cell(row=row, column=1, value=cf.get('date', '')).border = border
            ws_expected.cell(row=row, column=2, value=holding['bond_name']).border = border
            ws_expected.cell(row=row, column=3, value='Investment' if is_investment else 'Maturity').border = border
            
            if is_investment:
                ws_expected.cell(row=row, column=4, value='-').border = border
                ws_expected.cell(row=row, column=5, value='-').border = border
                gross = abs(cf.get('gross_amount', 0) or cf.get('amount', 0))
                ws_expected.cell(row=row, column=6, value=-gross).border = border
                ws_expected.cell(row=row, column=6).font = Font(name="Consolas", size=10, color="DC2626")
            else:
                principal = cf.get('principal_component', 0)
                interest = cf.get('interest_component', 0)
                gross = cf.get('gross_amount', principal + interest)
                ws_expected.cell(row=row, column=4, value=principal).border = border
                ws_expected.cell(row=row, column=5, value=interest).border = border
                ws_expected.cell(row=row, column=6, value=gross).border = border
                total_exp_principal += principal
                total_exp_interest += interest
                total_exp_gross += gross
            
            ws_expected.cell(row=row, column=4).font = money_font
            ws_expected.cell(row=row, column=4).number_format = '₹ #,##0.00'
            ws_expected.cell(row=row, column=5).font = money_font
            ws_expected.cell(row=row, column=5).number_format = '₹ #,##0.00'
            ws_expected.cell(row=row, column=6).font = money_font
            ws_expected.cell(row=row, column=6).number_format = '₹ #,##0.00'
            row += 1
    
    # Totals row for Expected
    row += 1
    ws_expected.cell(row=row, column=1, value="TOTALS").font = Font(bold=True)
    ws_expected.cell(row=row, column=4, value=total_exp_principal).font = Font(bold=True, name="Consolas")
    ws_expected.cell(row=row, column=4).number_format = '₹ #,##0.00'
    ws_expected.cell(row=row, column=5, value=total_exp_interest).font = Font(bold=True, name="Consolas")
    ws_expected.cell(row=row, column=5).number_format = '₹ #,##0.00'
    ws_expected.cell(row=row, column=6, value=total_exp_gross).font = Font(bold=True, name="Consolas")
    ws_expected.cell(row=row, column=6).number_format = '₹ #,##0.00'
    
    ws_expected.column_dimensions['A'].width = 15
    ws_expected.column_dimensions['B'].width = 25
    ws_expected.column_dimensions['C'].width = 12
    ws_expected.column_dimensions['D'].width = 15
    ws_expected.column_dimensions['E'].width = 15
    ws_expected.column_dimensions['F'].width = 18
    
    # ========== ACTUAL CASHFLOWS SHEET ==========
    ws_actual = wb.create_sheet(title="Actual Cashflows")
    
    ws_actual['A1'] = "ACTUAL CASHFLOWS"
    ws_actual['A1'].font = title_font
    ws_actual.merge_cells('A1:F1')
    
    # Headers for Actual (same as Expected for consistency)
    actual_headers = ["Date", "Bond Name", "Type", "Principal", "Interest", "Gross Amount"]
    for col, header in enumerate(actual_headers, 1):
        cell = ws_actual.cell(row=3, column=col, value=header)
        cell.font = header_font
        cell.fill = actual_fill
        cell.border = border
        cell.alignment = Alignment(horizontal='center')
    
    row = 4
    total_act_investment = 0
    total_act_principal = 0
    total_act_interest = 0
    total_act_gross = 0
    
    for holding in holdings_data['holdings']:
        actual_cfs = holding.get('actual_cashflows', [])
        for cf in actual_cfs:
            is_investment = cf.get('type') == 'investment'
            cf_type = cf.get('type', 'repayment').capitalize()
            
            ws_actual.cell(row=row, column=1, value=cf.get('date', '')).border = border
            ws_actual.cell(row=row, column=2, value=holding['bond_name']).border = border
            ws_actual.cell(row=row, column=3, value=cf_type).border = border
            
            if is_investment:
                ws_actual.cell(row=row, column=4, value='-').border = border
                ws_actual.cell(row=row, column=5, value='-').border = border
                gross = abs(cf.get('gross_amount', 0) or cf.get('amount', 0))
                ws_actual.cell(row=row, column=6, value=-gross).border = border
                ws_actual.cell(row=row, column=6).font = Font(name="Consolas", size=10, color="DC2626")
                total_act_investment += gross
            else:
                principal = cf.get('principal_component', 0) or 0
                interest = cf.get('interest_component', 0) or 0
                gross = cf.get('gross_amount', principal + interest) or (principal + interest)
                ws_actual.cell(row=row, column=4, value=principal).border = border
                ws_actual.cell(row=row, column=5, value=interest).border = border
                ws_actual.cell(row=row, column=6, value=gross).border = border
                total_act_principal += principal
                total_act_interest += interest
                total_act_gross += gross
            
            ws_actual.cell(row=row, column=4).font = money_font
            ws_actual.cell(row=row, column=4).number_format = '₹ #,##0.00'
            ws_actual.cell(row=row, column=5).font = money_font
            ws_actual.cell(row=row, column=5).number_format = '₹ #,##0.00'
            ws_actual.cell(row=row, column=6).font = money_font
            ws_actual.cell(row=row, column=6).number_format = '₹ #,##0.00'
            row += 1
    
    # Totals row for Actual
    if row > 4:
        row += 1
        ws_actual.cell(row=row, column=1, value="TOTALS").font = Font(bold=True)
        ws_actual.cell(row=row, column=4, value=total_act_principal).font = Font(bold=True, name="Consolas")
        ws_actual.cell(row=row, column=4).number_format = '₹ #,##0.00'
        ws_actual.cell(row=row, column=5, value=total_act_interest).font = Font(bold=True, name="Consolas")
        ws_actual.cell(row=row, column=5).number_format = '₹ #,##0.00'
        ws_actual.cell(row=row, column=6, value=total_act_gross).font = Font(bold=True, name="Consolas")
        ws_actual.cell(row=row, column=6).number_format = '₹ #,##0.00'
        
        # Profit row
        row += 1
        ws_actual.cell(row=row, column=1, value="PROFIT").font = Font(bold=True, color="059669")
        profit = total_act_gross - total_act_investment
        ws_actual.cell(row=row, column=6, value=profit).font = Font(bold=True, name="Consolas", color="059669")
        ws_actual.cell(row=row, column=6).number_format = '₹ #,##0.00'
    else:
        ws_actual.cell(row=row, column=1, value="No actual cashflows recorded yet")
    
    ws_actual.column_dimensions['A'].width = 15
    ws_actual.column_dimensions['B'].width = 25
    ws_actual.column_dimensions['C'].width = 12
    ws_actual.column_dimensions['D'].width = 15
    ws_actual.column_dimensions['E'].width = 15
    ws_actual.column_dimensions['F'].width = 18
    
    # Save to BytesIO
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"holdings_{holdings_data['client']['pan_number']}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== END HOLDINGS MANAGEMENT ====================


def calculate_xirr(dates, cashflows, guess=0.1):
    """
    Calculate XIRR (Extended Internal Rate of Return)
    dates: list of datetime objects
    cashflows: list of cashflow amounts (negative for outflows, positive for inflows)
    """
    if len(dates) != len(cashflows):
        raise ValueError("Dates and cashflows must have the same length")
    
    if len(dates) < 2:
        raise ValueError("Need at least 2 cashflows to calculate XIRR")
    
    # Convert dates to days from first date
    first_date = dates[0]
    days = [(d - first_date).days for d in dates]
    
    def xnpv(rate):
        """Calculate NPV with irregular periods"""
        return sum([cf / ((1 + rate) ** (day / 365.0)) for cf, day in zip(cashflows, days)])
    
    def xnpv_derivative(rate):
        """Derivative of NPV for Newton's method"""
        return sum([(-day / 365.0) * cf / ((1 + rate) ** (day / 365.0 + 1)) for cf, day in zip(cashflows, days)])
    
    try:
        # Use Newton's method to find the rate where NPV = 0
        rate = newton(xnpv, guess, fprime=xnpv_derivative, maxiter=100, tol=1e-6)
        return rate
    except:
        # If Newton fails, try bisection
        try:
            from scipy.optimize import brentq
            rate = brentq(xnpv, -0.999, 10.0)
            return rate
        except:
            return None


def calculate_price_for_irr(target_irr, dates, remaining_cashflows, investment_date):
    """
    Calculate the price to pay at investment_date to achieve target_irr
    given the remaining cashflows
    """
    if len(dates) == 0 or len(remaining_cashflows) == 0:
        return 0
    
    # Calculate present value of all future cashflows discounted at target_irr
    days_from_investment = [(d - investment_date).days for d in dates]
    
    price = sum([cf / ((1 + target_irr) ** (day / 365.0)) for cf, day in zip(remaining_cashflows, days_from_investment)])
    return price


# Define Models
class PrincipalPayment(BaseModel):
    date: str  # ISO format date
    percentage: float  # Percentage of principal (0-100)


class InterestPayment(BaseModel):
    date: str  # ISO format date
    amount: float


class BondCreate(BaseModel):
    bond_code: str = ""  # Unique bond identifier code
    name: str
    start_date: str  # ISO format
    end_date: str
    principal_amount: float
    coupon_rate: float = 0  # Annual coupon rate as percentage (optional if cashflows provided)
    primary_irr: float = 0  # Expected IRR for primary buyer as percentage
    secondary_irr: float = 0  # Target IRR for secondary buyers as percentage
    principal_payments: List[PrincipalPayment] = []  # Can be empty if cashflows provided
    interest_payment_frequency: str = "monthly"  # "monthly", "quarterly", "semi-annual", "annual", "custom"
    interest_payments: List[InterestPayment] = []  # For custom frequency or empty if cashflows provided
    cashflows_per_unit: List[dict] = []  # Direct cashflows: [{date, principal, interest}]
    total_units: int = 1  # Total number of units available for sale
    minimum_units: int = 1  # Minimum units per order
    units_sold: int = 0  # Number of units already sold
    cutoff_days: int = 15  # Days after investment where payments are still missed (for secondary market)
    description: Optional[str] = None  # Bond description
    isin: Optional[str] = None  # ISIN code
    
    @model_validator(mode='after')
    def validate_cashflows_or_payments(self):
        # If cashflows_per_unit is provided, skip principal payment validation
        if self.cashflows_per_unit and len(self.cashflows_per_unit) > 0:
            return self
        
        # Otherwise, validate principal payments sum to 100%
        if self.principal_payments:
            total = sum([p.percentage for p in self.principal_payments])
            if abs(total - 100.0) > 0.01:
                raise ValueError(f'Principal payments must sum to 100%, got {total}%')
        
        return self


def calculate_bond_status(bond: dict) -> str:
    """
    Calculate bond status dynamically based on units sold and end date.
    Returns: 'available', 'funded', or 'closed'
    """
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    end_date_str = bond.get('end_date')
    
    # Check if bond has passed its end date -> Closed
    if end_date_str:
        try:
            end_date = datetime.fromisoformat(end_date_str).date()
            today = datetime.now(timezone.utc).date()
            if today > end_date:
                return 'closed'
        except (ValueError, TypeError):
            pass
    
    # Check if all units are sold -> Funded
    if units_sold >= total_units:
        return 'funded'
    
    # Otherwise -> Available
    return 'available'


class Bond(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bond_code: str = ""  # Unique bond identifier code
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    principal_amount: float = 0
    coupon_rate: Optional[float] = None
    primary_irr: Optional[float] = None
    secondary_irr: Optional[float] = None
    minimum_units: int = 1  # Minimum units per order
    principal_payments: Optional[List[PrincipalPayment]] = []
    interest_payment_frequency: Optional[str] = None
    interest_payments: Optional[List[InterestPayment]] = []
    cashflows_per_unit: Optional[List[dict]] = []  # Exact cashflows per unit for secondary market bonds
    cutoff_days: int = 15  # Days after investment where payments are still missed (for secondary market)
    total_units: int = 1
    units_sold: int = 0
    status: Optional[str] = None  # Computed: 'available', 'funded', 'closed'
    listing_status: Optional[str] = "pending"  # 'pending' or 'active' - pending until price verification
    description: Optional[str] = None  # Bond description
    calculator_file_url: Optional[str] = None  # URL to the uploaded pricing calculator Excel
    calculator_filename: Optional[str] = None  # Original filename of the calculator
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Legacy fields for backward compatibility
    face_value: Optional[float] = None
    interest_rate: Optional[float] = None
    interest_frequency: Optional[str] = None
    maturity_date: Optional[str] = None
    issuer: Optional[str] = None
    created_by: Optional[str] = None


class SecondaryMarketCalculation(BaseModel):
    investment_date: str  # ISO format date
    units: int = 1  # Number of units to purchase


class SecondaryMarketResult(BaseModel):
    investment_date: str
    units_requested: int
    price_per_unit: float
    total_price: float
    remaining_principal: float
    remaining_interest: float
    total_inflows: float
    secondary_buyer_irr: float
    days_to_maturity: int
    units_available: int
    tds_rate: float = 10.0  # TDS percentage on interest


class CashflowItem(BaseModel):
    date: str
    month: str
    principal_payment: float
    interest_payment: float
    tds_deducted: float
    net_interest: float
    total_net_payment: float


class CashflowDownload(BaseModel):
    bond_name: str
    investment_date: str
    units: int
    price_paid: float
    cashflows: List[CashflowItem]
    total_principal: float
    total_interest: float
    total_tds: float
    total_net_received: float


class BondWithCalculations(BaseModel):
    bond: Bond
    total_cashflows_primary: float
    calculated_primary_irr: Optional[float]


# Routes
@api_router.get("/")
async def root():
    return {"message": "BondFlow Pro API", "version": "2.6.0", "updated": "2026-01-15T08:00:00Z"}


# Database Reset Endpoint (Protected)
RESET_SECRET_KEY = "KINNTEGRAA_RESET_2026"  # Change this in production

@api_router.post("/admin/reset-database")
async def reset_database(secret_key: str = None):
    """
    Reset database - clears all data EXCEPT broker accounts.
    
    Usage: POST /api/admin/reset-database?secret_key=KINNTEGRAA_RESET_2026
    
    This will delete:
    - All clients
    - All user accounts (except brokers)
    - All trades
    - All bonds/opportunities
    - All real estate opportunities
    - All cashflows
    - All analyses
    - All prepayment records
    - All uploaded files (except templates)
    
    Broker accounts are preserved so you can still login.
    """
    import shutil
    import glob
    
    if secret_key != RESET_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid secret key. Access denied.")
    
    try:
        deleted_counts = {}
        
        # 1. Delete all clients
        result = await db.clients.delete_many({})
        deleted_counts['clients'] = result.deleted_count
        
        # 2. Delete all non-broker users (keep broker accounts)
        result = await db.users.delete_many({"role": {"$ne": "broker"}})
        deleted_counts['users (non-broker)'] = result.deleted_count
        
        # 3. Delete all trades
        result = await db.trades.delete_many({})
        deleted_counts['trades'] = result.deleted_count
        
        # 4. Delete all bonds
        result = await db.bonds.delete_many({})
        deleted_counts['bonds'] = result.deleted_count
        
        # 5. Delete all real estate opportunities
        result = await db.real_estate_opportunities.delete_many({})
        deleted_counts['real_estate_opportunities'] = result.deleted_count
        
        # 6. Delete all holding cashflows
        result = await db.holding_cashflows.delete_many({})
        deleted_counts['holding_cashflows'] = result.deleted_count
        
        # 7. Delete all cashflows
        result = await db.cashflows.delete_many({})
        deleted_counts['cashflows'] = result.deleted_count
        
        # 8. Delete all analyses
        result = await db.analyses.delete_many({})
        deleted_counts['analyses'] = result.deleted_count
        
        # 9. Delete all prepayment records
        result = await db.prepayment_records.delete_many({})
        deleted_counts['prepayment_records'] = result.deleted_count
        
        # 10. Delete all sub-brokers (partners collection)
        result = await db.partners.delete_many({})
        deleted_counts['partners'] = result.deleted_count
        
        # 11. Delete sub-broker user accounts
        result = await db.users.delete_many({"role": "sub_broker"})
        deleted_counts['sub_broker_users'] = result.deleted_count
        
        # 12. Delete all CAS analyses
        result = await db.cas_analyses.delete_many({})
        deleted_counts['cas_analyses'] = result.deleted_count
        
        # 13. Delete real estate attachments/documents
        result = await db.real_estate_documents.delete_many({})
        deleted_counts['real_estate_documents'] = result.deleted_count
        
        # 14. Delete bond documents
        result = await db.bond_documents.delete_many({})
        deleted_counts['bond_documents'] = result.deleted_count
        
        # 15. Delete client documents
        result = await db.client_documents.delete_many({})
        deleted_counts['client_documents'] = result.deleted_count
        
        # 16. Delete any file attachments collection
        result = await db.attachments.delete_many({})
        deleted_counts['attachments'] = result.deleted_count
        
        # 17. Delete any uploads collection
        result = await db.uploads.delete_many({})
        deleted_counts['uploads'] = result.deleted_count
        
        # 18. Delete investment records
        result = await db.investments.delete_many({})
        deleted_counts['investments'] = result.deleted_count
        
        # 19. Delete notifications
        result = await db.notifications.delete_many({})
        deleted_counts['notifications'] = result.deleted_count
        
        # 20. Delete activity logs (optional - keep for audit?)
        result = await db.activity_logs.delete_many({})
        deleted_counts['activity_logs'] = result.deleted_count
        
        # 21. Delete scheme master
        result = await db.scheme_master.delete_many({})
        deleted_counts['scheme_master'] = result.deleted_count
        
        # 22. Delete password resets
        result = await db.password_resets.delete_many({})
        deleted_counts['password_resets'] = result.deleted_count
        
        # 23. Delete kinntegraa submissions
        result = await db.kinntegraa_submissions.delete_many({})
        deleted_counts['kinntegraa_submissions'] = result.deleted_count
        
        # 24. Delete broker settings
        result = await db.broker_settings.delete_many({})
        deleted_counts['broker_settings'] = result.deleted_count
        
        # 25. Delete real estate investments
        result = await db.real_estate_investments.delete_many({})
        deleted_counts['real_estate_investments'] = result.deleted_count
        
        # 26. Delete holdings
        result = await db.holdings.delete_many({})
        deleted_counts['holdings'] = result.deleted_count
        
        # 27. Delete currency projections
        result = await db.currency_projections.delete_many({})
        deleted_counts['currency_projections'] = result.deleted_count
        
        # 28. Delete leads (Lead Management)
        result = await db.leads.delete_many({})
        deleted_counts['leads'] = result.deleted_count
        
        # 29. Delete reinvestment submissions
        result = await db.reinvestment_submissions.delete_many({})
        deleted_counts['reinvestment_submissions'] = result.deleted_count
        
        # 30. Delete reinvestment approvals
        result = await db.reinvestment_approvals.delete_many({})
        deleted_counts['reinvestment_approvals'] = result.deleted_count
        
        # 31. Delete reinvestment logs
        result = await db.reinvestment_logs.delete_many({})
        deleted_counts['reinvestment_logs'] = result.deleted_count
        
        # 32. Delete approval logs
        result = await db.approval_logs.delete_many({})
        deleted_counts['approval_logs'] = result.deleted_count
        
        # 33. Delete approval workflows
        result = await db.approval_workflows.delete_many({})
        deleted_counts['approval_workflows'] = result.deleted_count
        
        # 34. Delete actual repayments
        result = await db.actual_repayments.delete_many({})
        deleted_counts['actual_repayments'] = result.deleted_count
        
        # 35. Clean uploaded files from disk (except templates)
        upload_dir = os.path.join(os.path.dirname(__file__), 'uploads')
        files_deleted = 0
        if os.path.exists(upload_dir):
            for item in os.listdir(upload_dir):
                item_path = os.path.join(upload_dir, item)
                # Skip templates folder
                if item == 'templates':
                    continue
                try:
                    if os.path.isfile(item_path):
                        os.remove(item_path)
                        files_deleted += 1
                    elif os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                        files_deleted += 1
                except Exception as e:
                    logger.warning(f"Could not delete {item_path}: {e}")
        deleted_counts['uploaded_files'] = files_deleted
        
        # Get remaining broker count
        broker_count = await db.users.count_documents({"role": "broker"})
        
        return {
            "success": True,
            "message": "Database reset successful. Broker accounts preserved.",
            "deleted": deleted_counts,
            "preserved": {
                "broker_accounts": broker_count
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Database reset failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")


@api_router.get("/bonds/cashflow-template")
async def download_cashflow_template(
    current_user: dict = Depends(get_current_user)
):
    """
    Download an Excel template for bond cashflow upload.
    The template includes:
    - Bond parameters section (Face Value, Coupon %, IRR, dates)
    - Cashflow table with columns: Date, Principal Repayment, Interest Repayment
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from io import BytesIO
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Cashflow per unit"
    
    # Styles
    header_font = Font(bold=True, size=11)
    header_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    param_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Bond Parameters Section
    params = [
        ("A1", "Bond Parameters", None),
        ("A2", "Deal ID", "BOND-001"),
        ("A3", "ISIN", "INE0XXX00000"),
        ("A4", "Bond Name", "Sample Bond Company"),
        ("A5", "Face Value", 100000),
        ("A6", "Coupon %", 0.125),  # 12.5% as decimal
        ("A7", "Primary IRR %", 0.1324),
        ("A8", "Client IRR %", 0.11),  # 11% as decimal
        ("A9", "Bond Start Date", "2025-01-01"),
        ("A10", "Bond Investment Date", "2025-02-01"),
        ("A11", "Bond Maturity Date", "2026-01-01"),
    ]
    
    for cell_ref, label, value in params:
        row = int(cell_ref[1:])
        ws[f"A{row}"] = label
        ws[f"A{row}"].font = header_font
        ws[f"A{row}"].fill = param_fill
        ws[f"A{row}"].border = border
        if value is not None:
            ws[f"B{row}"] = value
            ws[f"B{row}"].border = border
    
    # Cashflow Table Header
    ws["A13"] = "Cashflow Schedule"
    ws["A13"].font = Font(bold=True, size=12)
    
    headers = ["Date", "Principal Repayment", "Interest Repayment", "Total"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=14, column=col)
        cell.value = header
        cell.font = header_font
        cell.fill = header_fill
        cell.border = border
        cell.alignment = Alignment(horizontal="center")
    
    # Sample cashflow data (12 monthly payments for 1 year, equal principal)
    sample_cashflows = [
        ("2025-02-01", 8333.33, 1041.67),
        ("2025-03-01", 8333.33, 972.22),
        ("2025-04-01", 8333.33, 902.78),
        ("2025-05-01", 8333.33, 833.33),
        ("2025-06-01", 8333.33, 763.89),
        ("2025-07-01", 8333.33, 694.44),
        ("2025-08-01", 8333.33, 625.00),
        ("2025-09-01", 8333.33, 555.56),
        ("2025-10-01", 8333.33, 486.11),
        ("2025-11-01", 8333.33, 416.67),
        ("2025-12-01", 8333.33, 347.22),
        ("2026-01-01", 8333.37, 277.78),
    ]
    
    for row_idx, (date, principal, interest) in enumerate(sample_cashflows, 15):
        ws.cell(row=row_idx, column=1, value=date).border = border
        ws.cell(row=row_idx, column=2, value=principal).border = border
        ws.cell(row=row_idx, column=3, value=interest).border = border
        ws.cell(row=row_idx, column=4, value=f"=B{row_idx}+C{row_idx}").border = border
    
    # Total row
    total_row = 15 + len(sample_cashflows)
    ws.cell(row=total_row, column=1, value="Total").font = header_font
    ws.cell(row=total_row, column=1).border = border
    ws.cell(row=total_row, column=2, value=f"=SUM(B15:B{total_row-1})").border = border
    ws.cell(row=total_row, column=3, value=f"=SUM(C15:C{total_row-1})").border = border
    ws.cell(row=total_row, column=4, value=f"=SUM(D15:D{total_row-1})").border = border
    
    # Column widths
    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 20
    ws.column_dimensions['C'].width = 20
    ws.column_dimensions['D'].width = 15
    
    # Instructions sheet
    instructions = wb.create_sheet("Instructions")
    instructions["A1"] = "Bond Cashflow Template Instructions"
    instructions["A1"].font = Font(bold=True, size=14)
    
    instruction_text = [
        "",
        "1. Fill in the Bond Parameters section (rows 2-11) with your bond details:",
        "   - Face Value: The principal amount per unit",
        "   - Coupon %: Annual coupon rate as decimal (e.g., 0.125 for 12.5%)",
        "   - Client IRR %: Target IRR for client as decimal (e.g., 0.11 for 11%)",
        "   - Dates: Use YYYY-MM-DD format",
        "",
        "2. Fill in the Cashflow Schedule (starting row 15):",
        "   - Date: Payment date (YYYY-MM-DD)",
        "   - Principal Repayment: Principal amount paid on this date",
        "   - Interest Repayment: Interest amount paid on this date",
        "",
        "3. Important Notes:",
        "   - Enter values PER UNIT (not total)",
        "   - Total principal should equal Face Value",
        "   - Interest is calculated as: Balance × Days × Coupon / 365",
        "   - The system will calculate the bond price based on these cashflows",
        "",
        "4. Supported formats: .xlsx, .xls, .xlsm"
    ]
    
    for row, text in enumerate(instruction_text, 2):
        instructions[f"A{row}"] = text
    
    instructions.column_dimensions['A'].width = 80
    
    # Save to BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=bond_cashflow_template.xlsx"}
    )


@api_router.post("/bonds/parse-cashflow-excel")
async def parse_cashflow_excel(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Parse an Excel file containing bond cashflow details.
    
    Expected Excel format (matching 'Final Bond Calculation.xlsx'):
    - Row with 'Face Value': contains the face value
    - Row with 'Coupon %': contains coupon rate as decimal (e.g., 0.125)
    - Row with 'Primary IRR %': contains primary IRR
    - Row with 'Client IRR %': contains client IRR as decimal (e.g., 0.11)
    - Row with 'Bond Start Date': contains start date
    - Row with 'Bond Investment Date': contains investment date
    - Row with 'Bond Maturity Date': contains maturity date
    - Cashflow table with columns: Date, Principal Repayment, Interest Repayment
    
    Returns parsed bond details and cashflows.
    """
    import openpyxl
    from io import BytesIO
    
    if not file.filename.endswith(('.xlsx', '.xls', '.xlsm')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx, .xls, .xlsm)")
    
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(BytesIO(contents), data_only=True)
        
        # Try to find the cashflow sheet
        sheet_names = wb.sheetnames
        ws = None
        for name in ['Cashflow per unit', 'Cashflow', 'Sheet1', 'Sheet2']:
            if name in sheet_names:
                ws = wb[name]
                break
        
        if ws is None:
            ws = wb.active
        
        # Parse bond parameters from the sheet
        bond_params = {
            "face_value": None,
            "coupon_rate": None,
            "primary_irr": None,
            "client_irr": None,
            "bond_start_date": None,
            "investment_date": None,
            "bond_maturity_date": None,
            "bond_name": None,
            "deal_id": None,
            "isin": None
        }
        
        def safe_float(val):
            """Safely convert value to float, return None if not possible"""
            if val is None:
                return None
            if isinstance(val, (int, float)):
                return float(val)
            try:
                return float(str(val).replace(',', ''))
            except:
                return None
        
        # Scan first 20 rows for parameters
        for row in range(1, 21):
            cell_a = ws.cell(row=row, column=1).value
            cell_b = ws.cell(row=row, column=2).value
            
            if cell_a is None:
                continue
            
            cell_a_lower = str(cell_a).lower().strip()
            
            if 'face value' in cell_a_lower:
                bond_params['face_value'] = safe_float(cell_b)
            elif 'coupon' in cell_a_lower and '%' in cell_a_lower:
                bond_params['coupon_rate'] = safe_float(cell_b)
            elif 'primary irr' in cell_a_lower:
                bond_params['primary_irr'] = safe_float(cell_b)
            elif 'client irr' in cell_a_lower:
                bond_params['client_irr'] = safe_float(cell_b)
            elif 'start date' in cell_a_lower or 'bond start' in cell_a_lower:
                if cell_b:
                    if isinstance(cell_b, datetime):
                        bond_params['bond_start_date'] = cell_b.strftime('%Y-%m-%d')
                    else:
                        bond_params['bond_start_date'] = str(cell_b).split()[0]
            elif 'investment date' in cell_a_lower:
                if cell_b:
                    if isinstance(cell_b, datetime):
                        bond_params['investment_date'] = cell_b.strftime('%Y-%m-%d')
                    else:
                        bond_params['investment_date'] = str(cell_b).split()[0]
            elif 'maturity' in cell_a_lower or 'end date' in cell_a_lower:
                if cell_b:
                    if isinstance(cell_b, datetime):
                        bond_params['bond_maturity_date'] = cell_b.strftime('%Y-%m-%d')
                    else:
                        bond_params['bond_maturity_date'] = str(cell_b).split()[0]
            elif 'bond name' in cell_a_lower or 'company' in cell_a_lower:
                bond_params['bond_name'] = str(cell_b) if cell_b else None
            elif 'deal id' in cell_a_lower:
                bond_params['deal_id'] = str(cell_b) if cell_b else None
            elif 'isin' in cell_a_lower:
                bond_params['isin'] = str(cell_b) if cell_b else None
        
        # Find cashflow table header row
        header_row = None
        date_col = None
        principal_col = None
        interest_col = None
        
        for row in range(1, 50):
            for col in range(1, 15):
                cell_val = ws.cell(row=row, column=col).value
                if cell_val is None:
                    continue
                cell_lower = str(cell_val).lower().strip()
                
                if 'date' in cell_lower and header_row is None:
                    header_row = row
                    date_col = col
                elif 'principal' in cell_lower and 'repayment' in cell_lower:
                    principal_col = col
                elif 'interest' in cell_lower and 'repayment' in cell_lower:
                    interest_col = col
        
        # Parse cashflows
        cashflows = []
        if header_row and date_col:
            for row in range(header_row + 1, header_row + 100):
                date_val = ws.cell(row=row, column=date_col).value
                
                if date_val is None:
                    # Check if this is a "Total" row
                    check_total = ws.cell(row=row, column=1).value
                    if check_total and 'total' in str(check_total).lower():
                        break
                    continue
                
                # Parse date
                if isinstance(date_val, datetime):
                    cf_date = date_val.strftime('%Y-%m-%d')
                else:
                    try:
                        cf_date = str(date_val).split()[0]
                    except:
                        continue
                
                # Get principal and interest
                principal = 0
                interest = 0
                
                if principal_col:
                    p_val = ws.cell(row=row, column=principal_col).value
                    principal = safe_float(p_val) or 0
                
                if interest_col:
                    i_val = ws.cell(row=row, column=interest_col).value
                    interest = safe_float(i_val) or 0
                
                # Skip rows with no cashflow
                if principal == 0 and interest == 0:
                    continue
                
                cashflows.append({
                    "date": cf_date,
                    "principal": round(principal, 2),
                    "interest": round(interest, 2),
                    "total": round(principal + interest, 2)
                })
        
        # Calculate totals
        total_principal = sum(cf['principal'] for cf in cashflows)
        total_interest = sum(cf['interest'] for cf in cashflows)
        
        return {
            "success": True,
            "filename": file.filename,
            "sheet_used": ws.title,
            "bond_params": bond_params,
            "cashflows": cashflows,
            "summary": {
                "num_payments": len(cashflows),
                "total_principal": round(total_principal, 2),
                "total_interest": round(total_interest, 2),
                "total_payout": round(total_principal + total_interest, 2)
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing Excel file: {str(e)}")


@api_router.post("/bonds", response_model=Bond)
async def create_bond(bond_input: BondCreate):
    bond_dict = bond_input.model_dump()
    bond_obj = Bond(**bond_dict)
    
    doc = bond_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    _ = await db.bonds.insert_one(doc)
    return bond_obj


@api_router.get("/bonds")
async def get_bonds(
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get all bonds with pagination (brokers only see their own)"""
    skip = (page - 1) * limit
    
    # Optimized projection - exclude heavy cashflow data for list view
    projection = {
        "_id": 0,
        "id": 1,
        "bond_code": 1,
        "name": 1,
        "principal_amount": 1,
        "coupon_rate": 1,
        "primary_irr": 1,
        "secondary_irr": 1,
        "start_date": 1,
        "end_date": 1,
        "total_units": 1,
        "units_sold": 1,
        "interest_payment_frequency": 1,
        "listing_status": 1,
        "issuer": 1,
        "description": 1,
        "face_value": 1,
        "cashflows_per_unit": 1,  # Needed for price calculation
        "cutoff_days": 1,  # Needed for price calculation (record day convention)
        "interested_count": 1,  # For display on card
        "current_investors": 1,  # For display on card
        "created_at": 1,
        "created_by": 1
    }
    
    bonds = await db.bonds.find({}, projection).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    for bond in bonds:
        if isinstance(bond.get('created_at'), str):
            bond['created_at'] = datetime.fromisoformat(bond['created_at'])
        # Calculate and add status dynamically
        bond['status'] = calculate_bond_status(bond)
        
        # Calculate unique investors count from trades
        unique_investors = await db.trades.distinct("client_id", {"bond_id": bond['id'], "status": "approved"})
        bond['unique_investors'] = len(unique_investors)
        
        # Calculate interested count and total interested amount from leads
        leads_pipeline = [
            {
                "$match": {
                    "opportunity_id": bond['id'],
                    "opportunity_type": "bond",
                    "status": "open"
                }
            },
            {
                "$group": {
                    "_id": None,
                    "count": {"$sum": 1},
                    "total_amount": {"$sum": {"$ifNull": ["$investment_amount", 0]}}
                }
            }
        ]
        leads_result = await db.leads.aggregate(leads_pipeline).to_list(1)
        if leads_result:
            bond['interested_count'] = leads_result[0].get('count', 0)
            bond['interested_amount'] = leads_result[0].get('total_amount', 0)
        else:
            bond['interested_count'] = 0
            bond['interested_amount'] = 0
        
        # Mark as "In Demand" only if interested amount exceeds bond face_value * available_units
        total_units = bond.get('total_units', 0) or 0
        units_sold = bond.get('units_sold', 0) or 0
        available_units = max(0, total_units - units_sold)  # Ensure non-negative
        # Use face_value, fallback to principal_amount/total_units if not set
        face_value = bond.get('face_value') or bond.get('principal_amount', 0)
        if not face_value and total_units > 0:
            face_value = bond.get('principal_amount', 0) / total_units
        face_value = face_value or 0
        available_value = available_units * face_value
        bond['available_units'] = available_units  # Add for frontend display
        bond['in_demand'] = bond['interested_amount'] > available_value and bond['interested_amount'] > 0 and available_value > 0
        
        # Add cashflow repayment counts for funded/closed bonds (by unique dates, not total entries)
        # Get unique date values for total cashflows
        total_unique_dates = await db.holding_cashflows.distinct("date", {"bond_id": bond['id']})
        # Get unique date values for repaid cashflows
        repaid_unique_dates = await db.holding_cashflows.distinct("date", {"bond_id": bond['id'], "is_repaid": True})
        bond['total_cashflows_count'] = len(total_unique_dates)
        bond['repaid_cashflows_count'] = len(repaid_unique_dates)
    
    total = await db.bonds.count_documents({})
    
    return {
        "data": bonds,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit
        }
    }


@api_router.get("/bonds/available")
async def get_available_bonds(current_user: dict = Depends(get_current_user)):
    """Get bonds with available units (for sub-brokers and clients)"""
    # For sub-brokers and clients, only show 'active' listed bonds
    # Brokers can see all bonds in their admin view
    query = {}
    if current_user['role'] in ['sub_broker', 'client']:
        query['listing_status'] = 'active'
    
    # Optimized projection
    projection = {
        "_id": 0,
        "id": 1,
        "bond_code": 1,
        "name": 1,
        "principal_amount": 1,
        "coupon_rate": 1,
        "primary_irr": 1,
        "secondary_irr": 1,
        "start_date": 1,
        "end_date": 1,
        "total_units": 1,
        "units_sold": 1,
        "interest_payment_frequency": 1,
        "listing_status": 1,
        "issuer": 1,
        "face_value": 1,
        "cashflows_per_unit": 1,  # Needed for price calculation
        "cutoff_days": 1,  # Needed for price calculation
        "interested_count": 1,  # For display on card
        "current_investors": 1,  # For display on card
        "created_at": 1
    }
    
    # Get bonds
    bonds = await db.bonds.find(query, projection).to_list(1000)
    
    # Filter bonds with available units and not closed
    available_bonds = []
    for bond in bonds:
        if isinstance(bond.get('created_at'), str):
            bond['created_at'] = datetime.fromisoformat(bond['created_at'])
        
        # Calculate status
        status = calculate_bond_status(bond)
        bond['status'] = status
        
        # Calculate unique investors count from trades
        unique_investors = await db.trades.distinct("client_id", {"bond_id": bond['id'], "status": "approved"})
        bond['unique_investors'] = len(unique_investors)
        
        # Calculate interested count and total interested amount from leads
        leads_pipeline = [
            {
                "$match": {
                    "opportunity_id": bond['id'],
                    "opportunity_type": "bond",
                    "status": "open"
                }
            },
            {
                "$group": {
                    "_id": None,
                    "count": {"$sum": 1},
                    "total_amount": {"$sum": {"$ifNull": ["$investment_amount", 0]}}
                }
            }
        ]
        leads_result = await db.leads.aggregate(leads_pipeline).to_list(1)
        if leads_result:
            bond['interested_count'] = leads_result[0].get('count', 0)
            bond['interested_amount'] = leads_result[0].get('total_amount', 0)
        else:
            bond['interested_count'] = 0
            bond['interested_amount'] = 0
        
        # Mark as "In Demand" only if interested amount exceeds bond face_value * available_units
        total_units = bond.get('total_units', 0) or 0
        units_sold = bond.get('units_sold', 0) or 0
        available_units = max(0, total_units - units_sold)  # Ensure non-negative
        # Use face_value, fallback to principal_amount/total_units if not set
        face_value = bond.get('face_value') or bond.get('principal_amount', 0)
        if not face_value and total_units > 0:
            face_value = bond.get('principal_amount', 0) / total_units
        face_value = face_value or 0
        available_value = available_units * face_value
        bond['available_units'] = available_units  # Add for frontend display
        bond['in_demand'] = bond['interested_amount'] > available_value and bond['interested_amount'] > 0 and available_value > 0
        
        # Add cashflow repayment counts for funded/closed bonds (by unique dates, not total entries)
        # Get unique date values for total cashflows
        total_unique_dates = await db.holding_cashflows.distinct("date", {"bond_id": bond['id']})
        # Get unique date values for repaid cashflows
        repaid_unique_dates = await db.holding_cashflows.distinct("date", {"bond_id": bond['id'], "is_repaid": True})
        bond['total_cashflows_count'] = len(total_unique_dates)
        bond['repaid_cashflows_count'] = len(repaid_unique_dates)
        
        # Only include bonds that are 'available' (not funded or closed)
        if status == 'available':
            available_bonds.append(bond)
    
    return available_bonds


@api_router.get("/bonds/{bond_id}", response_model=BondWithCalculations)
async def get_bond(bond_id: str):
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    if isinstance(bond.get('created_at'), str):
        bond['created_at'] = datetime.fromisoformat(bond['created_at'])
    elif not bond.get('created_at'):
        bond['created_at'] = datetime.now(timezone.utc)
    
    # Calculate and add status
    bond['status'] = calculate_bond_status(bond)
    
    # Ensure required fields have default values
    bond.setdefault('interest_payments', [])
    bond.setdefault('principal_payments', [])
    bond.setdefault('principal_amount', 0)
    bond.setdefault('description', None)
    
    # Calculate total cashflows for primary buyer
    interest_payments = bond.get('interest_payments', [])
    total_cashflows = sum([ip.get('amount', 0) for ip in interest_payments if isinstance(ip, dict)])
    total_cashflows += bond.get('principal_amount', 0)  # Principal returned
    
    # Calculate actual IRR achieved by primary buyer
    calculated_irr = None
    try:
        if bond.get('start_date') and interest_payments:
            dates = [datetime.fromisoformat(bond['start_date'])]
            cashflows = [-bond.get('principal_amount', 0)]  # Initial investment
            
            # Add interest payments
            for ip in interest_payments:
                if isinstance(ip, dict) and ip.get('date'):
                    dates.append(datetime.fromisoformat(ip['date']))
                    cashflows.append(ip.get('amount', 0))
            
            # Add principal payments
            principal_payments = bond.get('principal_payments', [])
            for pp in principal_payments:
                if isinstance(pp, dict) and pp.get('date'):
                    dates.append(datetime.fromisoformat(pp['date']))
                    cashflows.append(bond.get('principal_amount', 0) * pp.get('percentage', 0) / 100)
            
            # Sort by date
            combined = sorted(zip(dates, cashflows), key=lambda x: x[0])
            dates = [c[0] for c in combined]
            cashflows = [c[1] for c in combined]
            
            # Combine cashflows on same date
            date_cashflow_map = {}
            for d, cf in zip(dates, cashflows):
                if d in date_cashflow_map:
                    date_cashflow_map[d] += cf
                else:
                    date_cashflow_map[d] = cf
            
            dates = sorted(date_cashflow_map.keys())
            cashflows = [date_cashflow_map[d] for d in dates]
            
            calculated_irr = calculate_xirr(dates, cashflows)
            if calculated_irr:
                calculated_irr = calculated_irr * 100  # Convert to percentage
    except Exception:
        calculated_irr = None
    
    return {
        "bond": bond,
        "total_cashflows_primary": total_cashflows,
        "calculated_primary_irr": calculated_irr
    }


@api_router.post("/bonds/{bond_id}/calculate", response_model=SecondaryMarketResult)
async def calculate_secondary_price(bond_id: str, calculation: SecondaryMarketCalculation):
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check if bond is closed
    status = calculate_bond_status(bond)
    if status == 'closed':
        raise HTTPException(status_code=400, detail="Cannot calculate price for a closed bond")
    
    investment_date = datetime.fromisoformat(calculation.investment_date)
    start_date = datetime.fromisoformat(bond['start_date'])
    end_date = datetime.fromisoformat(bond['end_date'])
    
    if investment_date < start_date or investment_date > end_date:
        raise HTTPException(status_code=400, detail="Investment date must be between start and end date")
    
    # Check units availability
    units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
    if calculation.units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Get remaining GROSS cashflows after investment date (for price calculation)
    remaining_dates = []
    remaining_cashflows_gross = []
    cutoff_days = bond.get('cutoff_days', 15)
    
    # Check if bond has cashflows_per_unit (new format)
    if bond.get('cashflows_per_unit') and len(bond['cashflows_per_unit']) > 0:
        # Use the new cashflows_per_unit format with proper cutoff logic
        for cf in bond['cashflows_per_unit']:
            cf_date_str = str(cf.get('date', '')).split('T')[0].split(' ')[0]
            if not cf_date_str:
                continue
            
            try:
                cf_date = datetime.fromisoformat(cf_date_str)
            except:
                continue
            
            # Support both 'principal' and 'principal_per_unit' key names
            principal = cf.get('principal', cf.get('principal_per_unit', 0)) or 0
            interest = cf.get('interest', cf.get('interest_per_unit', 0)) or 0
            total_cf = principal + interest
            
            # Calculate days from investment
            days_from_investment = (cf_date - investment_date).days
            
            # Apply cutoff: if days_from_investment > cutoff_days, include the cashflow
            if days_from_investment > cutoff_days:
                remaining_dates.append(cf_date)
                remaining_cashflows_gross.append(total_cf)
        
        # Helper to get cashflow amounts (support both key name formats)
        def get_principal(cf):
            return cf.get('principal', cf.get('principal_per_unit', 0)) or 0
        def get_interest(cf):
            return cf.get('interest', cf.get('interest_per_unit', 0)) or 0
        
        # Calculate remaining principal/interest from included cashflows
        remaining_principal = sum(get_principal(cf) for cf in bond['cashflows_per_unit'] 
                                  if (datetime.fromisoformat(str(cf.get('date', '')).split('T')[0].split(' ')[0]) - investment_date).days > cutoff_days)
        remaining_interest_gross = sum(get_interest(cf) for cf in bond['cashflows_per_unit']
                                       if (datetime.fromisoformat(str(cf.get('date', '')).split('T')[0].split(' ')[0]) - investment_date).days > cutoff_days)
    else:
        # Fallback to old format: interest_payments and principal_payments
        # Add remaining interest payments (GROSS)
        for ip in bond.get('interest_payments', []):
            ip_date = datetime.fromisoformat(ip['date'])
            if ip_date > investment_date:
                remaining_dates.append(ip_date)
                remaining_cashflows_gross.append(ip['amount'])
        
        # Add remaining principal payments
        remaining_principal_pct = 0
        for pp in bond.get('principal_payments', []):
            pp_date = datetime.fromisoformat(pp['date'])
            if pp_date > investment_date:
                remaining_dates.append(pp_date)
                remaining_cashflows_gross.append(bond['principal_amount'] * pp['percentage'] / 100)
                remaining_principal_pct += pp['percentage']
        
        # Combine cashflows on same date (GROSS amounts)
        date_cashflow_map = {}
        for d, cf in zip(remaining_dates, remaining_cashflows_gross):
            if d in date_cashflow_map:
                date_cashflow_map[d] += cf
            else:
                date_cashflow_map[d] = cf
        
        remaining_dates = sorted(date_cashflow_map.keys())
        remaining_cashflows_gross = [date_cashflow_map[d] for d in remaining_dates]
        
        remaining_principal = bond['principal_amount'] * remaining_principal_pct / 100
        remaining_interest_gross = sum(remaining_cashflows_gross) - remaining_principal
    
    if len(remaining_dates) == 0:
        raise HTTPException(status_code=400, detail="No remaining cashflows after investment date")
    
    # Calculate price using XNPV method if cashflows_per_unit exists
    if bond.get('cashflows_per_unit') and len(bond['cashflows_per_unit']) > 0:
        # Use the new XNPV-based calculation
        secondary_irr_decimal = bond['secondary_irr'] / 100
        
        # Calculate XNPV
        xnpv_total = 0
        for cf_date, cf_amount in zip(remaining_dates, remaining_cashflows_gross):
            days = (cf_date - investment_date).days
            if days > 0:
                discount_factor = (1 + secondary_irr_decimal) ** (days / 365)
                xnpv_total += cf_amount / discount_factor
        
        price_per_unit = xnpv_total
    else:
        # Use original calculation method
        secondary_irr_decimal = bond['secondary_irr'] / 100
        price_per_unit = calculate_price_for_irr(secondary_irr_decimal, remaining_dates, remaining_cashflows_gross, investment_date)
    
    # Calculate total price for requested units
    total_price = price_per_unit * calculation.units
    
    days_to_maturity = (end_date - investment_date).days
    
    total_inflows_gross = sum(remaining_cashflows_gross)
    
    # Calculate units available
    units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
    
    return {
        "investment_date": calculation.investment_date,
        "units_requested": calculation.units,
        "price_per_unit": round(price_per_unit, 2),
        "total_price": round(total_price, 2),
        "remaining_principal": round(remaining_principal, 2),
        "remaining_interest": round(remaining_interest_gross, 2),
        "total_inflows": round(total_inflows_gross, 2),
        "secondary_buyer_irr": bond['secondary_irr'],
        "days_to_maturity": days_to_maturity,
        "units_available": units_available,
        "tds_rate": 10.0
    }


class EnhancedCalculationRequest(BaseModel):
    settlement_date: str  # ISO format date (YYYY-MM-DD)
    units: int = 1


class EnhancedCalculationResult(BaseModel):
    # Basic info
    settlement_date: str
    units_requested: int
    face_value_per_unit: float
    
    # Price breakdown
    clean_price_per_unit: float  # PV of future cashflows at secondary IRR
    accrued_interest_per_unit: float  # Interest accumulated since last payment
    dirty_price_per_unit: float  # Clean + Accrued (total price)
    
    # Total amounts
    total_clean_price: float
    total_accrued_interest: float
    total_dirty_price: float  # This is what buyer pays
    
    # Stamp duty and final total
    stamp_duty: float  # Stamp duty = ROUND(consideration * 0.0001%, 0)
    total_consideration: float  # Total Consideration = Clean Price + Stamp Duty (final amount)
    
    # Premium/Discount
    premium_discount_per_unit: float  # Difference from face value
    premium_discount_percentage: float
    
    # Yield and cashflow info
    secondary_irr: float  # The IRR used (Proposed IRR for Client)
    coupon_rate: float
    days_to_maturity: int
    remaining_interest_payments: int
    remaining_principal_payments: int
    
    # Remaining cashflows
    total_remaining_principal: float
    total_remaining_interest: float
    total_future_cashflows: float
    
    # Units info
    units_available: int
    
    # Interest calculation details
    last_interest_payment_date: Optional[str] = None
    next_interest_payment_date: Optional[str] = None
    days_since_last_payment: int = 0
    days_in_current_period: int = 0
    accrued_interest_calculation: Optional[str] = None


@api_router.post("/bonds/{bond_id}/calculate-enhanced", response_model=EnhancedCalculationResult)
async def calculate_enhanced_secondary_price(bond_id: str, calculation: EnhancedCalculationRequest):
    """
    Enhanced Secondary Market Calculator
    
    Calculates:
    - Clean Price: Present Value of all future cashflows at Secondary IRR
    - Accrued Interest: Interest accumulated from last payment date to settlement date
    - Dirty Price: Clean Price + Accrued Interest (total amount buyer pays)
    - Premium/Discount: Difference from face value
    
    This replicates Excel-style bond calculations with XNPV-like discounting.
    """
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check if bond is closed
    status = calculate_bond_status(bond)
    if status == 'closed':
        raise HTTPException(status_code=400, detail="Cannot calculate price for a closed bond")
    
    settlement_date = datetime.fromisoformat(calculation.settlement_date)
    start_date = datetime.fromisoformat(bond['start_date'])
    end_date = datetime.fromisoformat(bond['end_date'])
    
    if settlement_date < start_date:
        raise HTTPException(status_code=400, detail="Settlement date cannot be before bond start date")
    if settlement_date > end_date:
        raise HTTPException(status_code=400, detail="Settlement date cannot be after bond maturity date")
    
    # Check units availability
    units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
    if calculation.units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Get bond details
    face_value = bond.get('face_value') or bond.get('principal_amount', 0)
    coupon_rate = bond.get('coupon_rate', 0) / 100  # Convert to decimal
    secondary_irr = bond.get('secondary_irr', 0) / 100  # Convert to decimal
    
    # Check if bond has cashflows_per_unit (new format) or legacy arrays
    cashflows_per_unit = bond.get('cashflows_per_unit', [])
    interest_payments = bond.get('interest_payments', [])
    principal_payments = bond.get('principal_payments', [])
    
    # If cashflows_per_unit exists, convert to interest_payments and principal_payments format
    if cashflows_per_unit and len(cashflows_per_unit) > 0:
        interest_payments = []
        principal_payments = []
        for cf in cashflows_per_unit:
            cf_date = cf.get('date')
            # Support both 'interest' and 'interest_per_unit' key names
            interest_amount = cf.get('interest', cf.get('interest_per_unit', 0))
            principal_amount = cf.get('principal', cf.get('principal_per_unit', 0))
            
            if interest_amount > 0:
                interest_payments.append({
                    'date': cf_date,
                    'amount': interest_amount
                })
            if principal_amount > 0:
                # Convert to percentage format for compatibility
                principal_pct = (principal_amount / face_value) * 100 if face_value > 0 else 0
                principal_payments.append({
                    'date': cf_date,
                    'percentage': principal_pct,
                    'amount': principal_amount  # Also store absolute amount
                })
    
    # Get cutoff days / record day convention (days before payment date that determines ownership)
    # Default is 15 days if not specified
    record_day_convention = bond.get('cutoff_days', bond.get('record_day_convention', 15))
    
    # Get coupon rate for recalculating interest with full precision
    coupon_rate_decimal = bond.get('coupon_rate', 0) / 100
    
    # Helper function to calculate days in previous month
    def get_days_in_prev_month(date):
        if date.month == 1:
            prev_month = 12
            prev_year = date.year - 1
        else:
            prev_month = date.month - 1
            prev_year = date.year
        
        # Days in month
        if prev_month in [1, 3, 5, 7, 8, 10, 12]:
            return 31
        elif prev_month in [4, 6, 9, 11]:
            return 30
        else:  # February
            # Check for leap year
            if (prev_year % 4 == 0 and prev_year % 100 != 0) or (prev_year % 400 == 0):
                return 29
            return 28
    
    # Find last and next interest payment dates relative to settlement
    past_payments = []
    future_payments = []
    
    # Track remaining principal for interest calculation
    # Principal reduces after each principal payment
    principal_payment_dates = {datetime.fromisoformat(pp['date']): pp['percentage'] / 100 for pp in principal_payments}
    
    for ip in interest_payments:
        ip_date = datetime.fromisoformat(ip['date'])
        
        # Use the stored interest amount directly from the bond data
        # This ensures we use the exact values that were uploaded/calculated during bond creation
        interest_amount = ip.get('amount', 0)
        
        # Calculate days from settlement date to payment
        days_from_settlement = (ip_date - settlement_date).days
        
        if ip_date <= settlement_date:
            past_payments.append((ip_date, interest_amount))
        else:
            # Use cutoff_days logic: only include if days_from_settlement > record_day_convention
            # This matches the /calculate endpoint behavior
            if days_from_settlement > record_day_convention:
                # Buyer will receive this payment
                future_payments.append((ip_date, interest_amount))
            # else: Buyer won't receive this payment (within cutoff period)
    
    past_payments.sort(key=lambda x: x[0], reverse=True)
    future_payments.sort(key=lambda x: x[0])
    
    # Get last and next payment dates
    last_payment_date = past_payments[0][0] if past_payments else start_date
    next_payment_date = future_payments[0][0] if future_payments else end_date
    
    # Calculate days for accrued interest
    days_since_last = (settlement_date - last_payment_date).days
    days_in_period = (next_payment_date - last_payment_date).days
    if days_in_period == 0:
        days_in_period = 1  # Avoid division by zero
    
    # Calculate Accrued Interest
    if future_payments:
        next_interest_amount = future_payments[0][1]
        accrued_interest_per_unit = (days_since_last / days_in_period) * next_interest_amount if days_in_period > 0 else 0
    else:
        # No future interest payments, calculate based on daily rate
        daily_rate = coupon_rate_decimal / 365
        accrued_interest_per_unit = face_value * daily_rate * days_since_last
    
    # Round accrued interest
    accrued_interest_per_unit = round(accrued_interest_per_unit, 2)
    
    # Calculate Clean Price using XNPV formula
    # Clean Price = PV of future cashflows that the BUYER will receive at Secondary IRR
    # Note: Only includes interest payments where settlement is on/before record date
    clean_price_pv = 0.0
    remaining_interest_count = 0
    remaining_principal_count = 0
    total_remaining_interest = 0.0
    total_remaining_principal = 0.0
    
    # Add future interest payments to PV calculation (only those buyer will receive)
    for ip_date, ip_amount in future_payments:
        days_to_payment = (ip_date - settlement_date).days
        years_to_payment = days_to_payment / 365.0
        discount_factor = (1 + secondary_irr) ** years_to_payment
        clean_price_pv += ip_amount / discount_factor
        remaining_interest_count += 1
        total_remaining_interest += ip_amount
    
    # Add future principal payments to PV calculation
    for pp in principal_payments:
        pp_date = datetime.fromisoformat(pp['date'])
        days_from_settlement = (pp_date - settlement_date).days
        
        # Use same cutoff logic as interest payments
        if days_from_settlement > record_day_convention:
            # Use absolute amount if available (from cashflows_per_unit), otherwise calculate from percentage
            if 'amount' in pp and pp['amount'] > 0:
                principal_amount = pp['amount']
            else:
                principal_amount = face_value * pp['percentage'] / 100
            years_to_payment = days_from_settlement / 365
            discount_factor = 1 / ((1 + secondary_irr) ** years_to_payment)
            clean_price_pv += principal_amount * discount_factor
            remaining_principal_count += 1
            total_remaining_principal += principal_amount
    
    clean_price_per_unit = round(clean_price_pv, 2)
    
    # Dirty Price = Clean Price + Accrued Interest
    dirty_price_per_unit = round(clean_price_per_unit + accrued_interest_per_unit, 2)
    
    # Premium/Discount calculation
    premium_discount = dirty_price_per_unit - face_value
    premium_discount_pct = (premium_discount / face_value) * 100 if face_value > 0 else 0
    
    # Calculate totals
    units = calculation.units
    total_clean = round(clean_price_per_unit * units, 2)
    total_accrued = round(accrued_interest_per_unit * units, 2)
    total_dirty = round(dirty_price_per_unit * units, 2)
    
    # Calculate Stamp Duty: ROUND(consideration * 0.0001%, 0)
    # 0.0001% = 0.000001
    # Per Excel formula: =ROUND(E22*0.0001%,0)
    stamp_duty = round(total_clean * 0.000001, 0)
    
    # Total Consideration = Clean Price + Stamp Duty
    total_consideration = round(total_clean + stamp_duty, 2)
    
    # Days to maturity
    days_to_maturity = (end_date - settlement_date).days
    
    # Accrued interest calculation explanation
    accrued_calc_explanation = (
        f"({days_since_last} days / {days_in_period} days) × "
        f"₹{future_payments[0][1] if future_payments else 0:.2f} = ₹{accrued_interest_per_unit:.2f}"
    )
    
    return {
        "settlement_date": calculation.settlement_date,
        "units_requested": units,
        "face_value_per_unit": face_value,
        
        # Price breakdown
        "clean_price_per_unit": clean_price_per_unit,
        "accrued_interest_per_unit": accrued_interest_per_unit,
        "dirty_price_per_unit": dirty_price_per_unit,
        
        # Total amounts
        "total_clean_price": total_clean,
        "total_accrued_interest": total_accrued,
        "total_dirty_price": total_dirty,
        
        # Stamp duty and final total
        "stamp_duty": stamp_duty,
        "total_consideration": total_consideration,
        
        # Premium/Discount
        "premium_discount_per_unit": round(premium_discount, 2),
        "premium_discount_percentage": round(premium_discount_pct, 2),
        
        # Yield and cashflow info
        "secondary_irr": bond.get('secondary_irr', 0),
        "coupon_rate": bond.get('coupon_rate', 0),
        "days_to_maturity": days_to_maturity,
        "remaining_interest_payments": remaining_interest_count,
        "remaining_principal_payments": remaining_principal_count,
        
        # Remaining cashflows
        "total_remaining_principal": round(total_remaining_principal, 2),
        "total_remaining_interest": round(total_remaining_interest, 2),
        "total_future_cashflows": round(total_remaining_principal + total_remaining_interest, 2),
        
        # Units info
        "units_available": units_available,
        
        # Interest calculation details
        "last_interest_payment_date": last_payment_date.strftime('%Y-%m-%d'),
        "next_interest_payment_date": next_payment_date.strftime('%Y-%m-%d') if future_payments else None,
        "days_since_last_payment": days_since_last,
        "days_in_current_period": days_in_period,
        "accrued_interest_calculation": accrued_calc_explanation
    }


class MonthlyIRRCalculationRequest(BaseModel):
    """Request model for Monthly IRR calculation"""
    settlement_date: str  # ISO format date
    units: int = 1


class MonthlyIRRCalculationResult(BaseModel):
    """Response model for Monthly IRR calculation - matches your Excel formula"""
    settlement_date: str
    units: int
    face_value_per_unit: float
    total_principal: float
    coupon_rate: float
    secondary_irr: float
    total_months: int
    remaining_months: int
    monthly_principal_payment: float
    opening_principal: float
    total_client_payment: float
    price_per_unit: float
    cashflow_schedule: List[dict]


@api_router.post("/bonds/{bond_id}/calculate-monthly-irr")
async def calculate_monthly_irr_price(bond_id: str, calculation: MonthlyIRRCalculationRequest):
    """
    Secondary Bond Calculator using Monthly IRR discounting.
    
    Formula:
    1. elapsed = count repayments before InvestmentDate
    2. outstanding = totalPrincipal - (elapsed × monthlyPrincipal)
    3. For each repayment >= nextRepayment:
       - interest = outstanding × coupon/12
       - cashflow = monthlyPrincipal + interest
       - n = days from investment to payment / 30
       - PV = cashflow / (1 + IRR/12)^n
       - outstanding -= monthlyPrincipal
    4. accrued = outstanding × (coupon/12) × (daysSinceLastPayment / daysInMonth)
    5. totalPrice = sum(PVs) + accrued
    6. pricePerUnit = totalPrice / units
    """
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    status = calculate_bond_status(bond)
    if status == 'closed':
        raise HTTPException(status_code=400, detail="Cannot calculate price for a closed bond")
    
    investment_date = datetime.fromisoformat(calculation.settlement_date)
    start_date = datetime.fromisoformat(bond['start_date'])
    end_date = datetime.fromisoformat(bond['end_date'])
    
    if investment_date < start_date:
        raise HTTPException(status_code=400, detail="Investment date cannot be before bond start date")
    if investment_date > end_date:
        raise HTTPException(status_code=400, detail="Investment date cannot be after bond maturity date")
    
    units = calculation.units
    units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
    if units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Get bond details
    face_value = bond.get('face_value') or bond.get('principal_amount', 0)
    coupon_rate = bond.get('coupon_rate', 0) / 100
    secondary_irr = bond.get('secondary_irr', 0) / 100
    
    # Get principal payment dates
    principal_payments = bond.get('principal_payments', [])
    total_months = len(principal_payments)
    
    if total_months == 0:
        raise HTTPException(status_code=400, detail="Bond has no principal payment schedule")
    
    # Sort payment dates
    repayment_dates = sorted([datetime.fromisoformat(pp['date']) for pp in principal_payments])
    
    # Basic calculations
    total_principal = face_value * units
    monthly_principal = total_principal / total_months
    monthly_interest_rate = coupon_rate / 12
    monthly_irr = secondary_irr / 12
    
    # Count repayments before investment date (elapsed)
    elapsed = sum(1 for d in repayment_dates if d <= investment_date)
    
    # Outstanding principal after elapsed payments
    outstanding = total_principal - (elapsed * monthly_principal)
    
    # Find last payment date (for accrued interest calculation)
    last_payment_date = None
    next_payment_date = None
    for i, d in enumerate(repayment_dates):
        if d <= investment_date:
            last_payment_date = d
        else:
            if next_payment_date is None:
                next_payment_date = d
    
    if next_payment_date is None:
        raise HTTPException(status_code=400, detail="No remaining payments after investment date")
    
    # If no last payment, use bond start date
    if last_payment_date is None:
        last_payment_date = start_date
    
    # Days since last payment (for accrued interest)
    days_since_last = (investment_date - last_payment_date).days
    
    # Days in the current payment period
    days_in_period = (next_payment_date - last_payment_date).days
    if days_in_period <= 0:
        days_in_period = 30  # Default to 30 if calculation fails
    
    # Calculate PV of future cashflows
    cashflow_schedule = []
    pv_sum = 0
    current_outstanding = outstanding
    
    for repayment_date in repayment_dates:
        if repayment_date <= investment_date:
            continue
        
        # Interest on current outstanding
        interest = current_outstanding * monthly_interest_rate
        
        # Total cashflow
        cashflow = monthly_principal + interest
        
        # n = days from investment to payment / 30
        days_to_payment = (repayment_date - investment_date).days
        n = days_to_payment / 30
        
        # Discount factor
        discount_factor = 1 / ((1 + monthly_irr) ** n)
        
        # Present Value
        pv = cashflow * discount_factor
        pv_sum += pv
        
        cashflow_schedule.append({
            "payment_date": repayment_date.strftime('%Y-%m-%d'),
            "opening_principal": round(current_outstanding, 2),
            "principal_payment": round(monthly_principal, 2),
            "interest_payment": round(interest, 2),
            "total_cashflow": round(cashflow, 2),
            "days_to_payment": days_to_payment,
            "n_months": round(n, 4),
            "discount_factor": round(discount_factor, 6),
            "present_value": round(pv, 2)
        })
        
        # Reduce for next iteration
        current_outstanding -= monthly_principal
    
    # Accrued interest (seller's portion - buyer pays this to seller)
    # Using actual days in period for accuracy
    accrued_interest = outstanding * monthly_interest_rate * (days_since_last / days_in_period)
    
    # Total client payment = PV of cashflows + Accrued interest
    total_client_payment = pv_sum + accrued_interest
    
    # Price per unit
    price_per_unit = total_client_payment / units
    
    # Clean price per unit (without accrued)
    clean_price_per_unit = pv_sum / units
    
    return {
        "investment_date": calculation.settlement_date,
        "units": units,
        "face_value_per_unit": face_value,
        "total_principal": round(total_principal, 2),
        "coupon_rate": bond.get('coupon_rate', 0),
        "secondary_irr": bond.get('secondary_irr', 0),
        "total_months": total_months,
        "elapsed_months": elapsed,
        "remaining_months": total_months - elapsed,
        "monthly_principal_payment": round(monthly_principal, 2),
        "monthly_interest_rate_pct": round(monthly_interest_rate * 100, 4),
        "monthly_irr_pct": round(monthly_irr * 100, 4),
        "opening_outstanding": round(outstanding, 2),
        "last_payment_date": last_payment_date.strftime('%Y-%m-%d'),
        "next_payment_date": next_payment_date.strftime('%Y-%m-%d'),
        "days_since_last_payment": days_since_last,
        "days_in_period": days_in_period,
        "clean_price_total": round(pv_sum, 2),
        "clean_price_per_unit": round(clean_price_per_unit, 2),
        "accrued_interest": round(accrued_interest, 2),
        "accrued_interest_per_unit": round(accrued_interest / units, 2),
        "total_client_payment": round(total_client_payment, 2),
        "price_per_unit": round(price_per_unit, 2),
        "cashflow_schedule": cashflow_schedule
    }
async def delete_bond(bond_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a bond (brokers only) - cannot delete funded or closed bonds"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete bonds")
    
    # Check if bond exists
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check bond status - prevent deletion of funded or closed bonds
    status = calculate_bond_status(bond)
    if status in ['funded', 'closed']:
        raise HTTPException(status_code=400, detail=f"Cannot delete a {status} bond")
    
    result = await db.bonds.delete_one({"id": bond_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    return {"message": "Bond deleted successfully"}


class BondUpdate(BaseModel):
    name: Optional[str] = None
    bond_code: Optional[str] = None
    issuer: Optional[str] = None
    principal_amount: Optional[float] = None
    coupon_rate: Optional[float] = None
    primary_irr: Optional[float] = None
    secondary_irr: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    interest_payment_frequency: Optional[str] = None
    total_units: Optional[int] = None
    units_sold: Optional[int] = None
    face_value: Optional[float] = None
    description: Optional[str] = None
    cutoff_days: Optional[int] = None  # Days before payment that determines record date
    calculator_file_url: Optional[str] = None  # URL to the uploaded calculator Excel
    listing_status: Optional[str] = None  # 'pending' or 'active'


@api_router.put("/bonds/{bond_id}")
async def update_bond(bond_id: str, bond_update: BondUpdate, current_user: dict = Depends(get_current_user)):
    """Update a bond (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update bonds")
    
    # Check if bond exists
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Build update dict with only provided fields
    update_data = {}
    updatable_fields = [
        'name', 'bond_code', 'issuer', 'principal_amount', 'coupon_rate', 'primary_irr', 
        'secondary_irr', 'start_date', 'end_date', 'interest_payment_frequency',
        'total_units', 'units_sold', 'face_value', 'description', 'cutoff_days', 'calculator_file_url',
        'listing_status'
    ]
    
    for field in updatable_fields:
        value = getattr(bond_update, field, None)
        if value is not None:
            update_data[field] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.bonds.update_one({"id": bond_id}, {"$set": update_data})
    
    # Return updated bond
    updated_bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    return updated_bond


@api_router.delete("/bonds/{bond_id}")
async def delete_bond(bond_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a bond (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete bonds")
    
    # Check if bond exists
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check if bond has any trades
    trades_count = await db.trades.count_documents({"bond_id": bond_id})
    if trades_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete bond with existing trades ({trades_count} trades found)")
    
    # Delete the bond
    await db.bonds.delete_one({"id": bond_id})
    
    return {"message": "Bond deleted successfully", "bond_id": bond_id}


@api_router.post("/bonds/upload-calculator")
async def upload_bond_calculator(
    file: UploadFile = File(...),
    bond_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a pricing calculator Excel file for a bond.
    Parses the Excel to extract cut-off days and stores the file.
    """
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers can upload calculator files")
    
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xlsm', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files are allowed (.xlsx, .xlsm, .xls)")
    
    # Check if bond exists
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Save file to uploads directory
        import os
        uploads_dir = "/app/uploads/calculators"
        os.makedirs(uploads_dir, exist_ok=True)
        
        # Generate unique filename
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{bond_id}_{uuid.uuid4().hex[:8]}{file_ext}"
        file_path = os.path.join(uploads_dir, unique_filename)
        
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        # Parse Excel to extract cut-off days and secondary IRR
        cutoff_days = 15  # Default
        secondary_irr = None  # Will be extracted from Excel
        try:
            import openpyxl
            from io import BytesIO
            
            wb = openpyxl.load_workbook(BytesIO(file_content), data_only=True)
            
            # Try to find cutoff days and secondary IRR in Sec_Pur sheet first
            if 'Sec_Pur' in wb.sheetnames:
                ws = wb['Sec_Pur']
                for row in ws.iter_rows(max_row=30, max_col=15):
                    for cell in row:
                        if cell.value and isinstance(cell.value, str):
                            cell_lower = cell.value.lower()
                            # Look for record day convention
                            if 'record' in cell_lower and 'day' in cell_lower:
                                try:
                                    # Check cell to the right (usually column E or next column)
                                    for offset in [1, 2, 3]:
                                        next_cell = ws.cell(row=cell.row, column=cell.column + offset)
                                        if next_cell.value and isinstance(next_cell.value, (int, float)):
                                            cutoff_days = int(next_cell.value)
                                            break
                                except:
                                    pass
                            # Look for Proposed IRR or Secondary IRR
                            elif 'proposed irr' in cell_lower or 'secondary irr' in cell_lower or 'xirr' in cell_lower:
                                try:
                                    for offset in [1, 2, 3]:
                                        next_cell = ws.cell(row=cell.row, column=cell.column + offset)
                                        if next_cell.value and isinstance(next_cell.value, (int, float)):
                                            # Convert to percentage if needed
                                            irr_val = float(next_cell.value)
                                            if irr_val > 1:  # Already in percentage form
                                                secondary_irr = irr_val
                                            else:  # In decimal form
                                                secondary_irr = irr_val * 100
                                            break
                                except:
                                    pass
            
            # Also check Pri_Sale sheet
            if 'Pri_Sale' in wb.sheetnames:
                ws = wb['Pri_Sale']
                for row in ws.iter_rows(max_row=30, max_col=15):
                    for cell in row:
                        if cell.value and isinstance(cell.value, str):
                            cell_lower = cell.value.lower()
                            if 'record' in cell_lower and cutoff_days == 15:
                                try:
                                    for offset in [1, 2, 3]:
                                        next_cell = ws.cell(row=cell.row, column=cell.column + offset)
                                        if next_cell.value and isinstance(next_cell.value, (int, float)):
                                            cutoff_days = int(next_cell.value)
                                            break
                                except:
                                    pass
                            elif ('proposed irr' in cell_lower or 'secondary' in cell_lower) and secondary_irr is None:
                                try:
                                    for offset in [1, 2, 3]:
                                        next_cell = ws.cell(row=cell.row, column=cell.column + offset)
                                        if next_cell.value and isinstance(next_cell.value, (int, float)):
                                            irr_val = float(next_cell.value)
                                            if irr_val > 1:
                                                secondary_irr = irr_val
                                            else:
                                                secondary_irr = irr_val * 100
                                            break
                                except:
                                    pass
            
            # Check Reference sheet for additional info
            if 'Reference' in wb.sheetnames:
                ws = wb['Reference']
                for row in ws.iter_rows(max_row=50, max_col=10):
                    for cell in row:
                        if cell.value and isinstance(cell.value, str):
                            cell_lower = cell.value.lower()
                            if ('record' in cell_lower or 'cut' in cell_lower) and cutoff_days == 15:
                                try:
                                    next_cell = ws.cell(row=cell.row, column=cell.column + 1)
                                    if next_cell.value and isinstance(next_cell.value, (int, float)):
                                        cutoff_days = int(next_cell.value)
                                except:
                                    pass
                            elif 'secondary' in cell_lower and 'irr' in cell_lower and secondary_irr is None:
                                try:
                                    next_cell = ws.cell(row=cell.row, column=cell.column + 1)
                                    if next_cell.value and isinstance(next_cell.value, (int, float)):
                                        irr_val = float(next_cell.value)
                                        secondary_irr = irr_val if irr_val > 1 else irr_val * 100
                                except:
                                    pass
            
            wb.close()
        except Exception as parse_error:
            print(f"Error parsing Excel: {parse_error}")
            # Continue with defaults
        
        # Generate file URL
        backend_url = os.environ.get('BACKEND_URL', '')
        file_url = f"/api/uploads/calculators/{unique_filename}"
        
        # Build update data
        update_data = {
            "calculator_file_url": file_url,
            "calculator_filename": file.filename,
            "cutoff_days": cutoff_days,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Only update secondary_irr if extracted from Excel
        if secondary_irr is not None:
            update_data["secondary_irr"] = secondary_irr
        
        # Update bond with calculator info
        await db.bonds.update_one(
            {"id": bond_id},
            {"$set": update_data}
        )
        
        return {
            "success": True,
            "file_url": file_url,
            "filename": file.filename,
            "cutoff_days": cutoff_days,
            "secondary_irr": secondary_irr,
            "message": f"Calculator uploaded. Cut-off days: {cutoff_days}" + (f", Secondary IRR: {secondary_irr}%" if secondary_irr else "")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload calculator: {str(e)}")


# Serve uploaded calculator files
@api_router.get("/uploads/calculators/{filename}")
async def serve_calculator_file(filename: str):
    """Serve uploaded calculator files"""
    import os
    from fastapi.responses import FileResponse
    
    file_path = f"/app/uploads/calculators/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


class RecordSale(BaseModel):
    units: int = 1


@api_router.post("/bonds/{bond_id}/record-sale")
async def record_sale(bond_id: str, sale: RecordSale):
    """Record a sale and update units sold"""
    bond = await db.bonds.find_one({"id": bond_id})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    units_available = total_units - units_sold
    
    if sale.units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Update units sold
    new_units_sold = units_sold + sale.units
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {"units_sold": new_units_sold}}
    )
    
    return {
        "message": f"Recorded sale of {sale.units} unit(s)",
        "units_sold": new_units_sold,
        "units_available": total_units - new_units_sold
    }


@api_router.post("/bonds/{bond_id}/verify-pricing")
async def verify_bond_pricing(
    bond_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Verify bond pricing by comparing system-calculated prices with uploaded Excel prices.
    
    The Excel should have columns: Date, Expected Price (or Price)
    System will calculate prices for those dates and compare.
    If ALL prices match exactly, the bond listing_status will be set to 'active'.
    
    Returns comparison results for each date.
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can verify bond pricing")
    
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    # Check if bond exists
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check if bond has cashflows_per_unit
    if not bond.get('cashflows_per_unit'):
        raise HTTPException(
            status_code=400, 
            detail="Bond does not have cashflows_per_unit defined. Cannot calculate prices."
        )
    
    import pandas as pd
    
    content = await file.read()
    excel_file = io.BytesIO(content)
    
    try:
        # Read the Excel file - try to find date and price columns
        df = pd.read_excel(excel_file, sheet_name=0)
        df.columns = [str(col).strip().lower().replace(' ', '_') for col in df.columns]
        
        # Find date column
        date_col = None
        for col in df.columns:
            if 'date' in col:
                date_col = col
                break
        
        if not date_col:
            # Try first column if it looks like dates
            first_col = df.columns[0]
            try:
                pd.to_datetime(df[first_col].dropna().iloc[0])
                date_col = first_col
            except:
                raise HTTPException(status_code=400, detail="Could not find a date column in the Excel file")
        
        # Find price column
        price_col = None
        for col in df.columns:
            if 'price' in col or 'expected' in col or 'value' in col:
                price_col = col
                break
        
        if not price_col:
            # Try second column
            if len(df.columns) > 1:
                price_col = df.columns[1]
            else:
                raise HTTPException(status_code=400, detail="Could not find a price column in the Excel file")
        
        # Process each row
        comparison_results = []
        all_matched = True
        total_rows = 0
        matched_rows = 0
        mismatched_rows = 0
        
        cutoff_days = bond.get('cutoff_days', 15)
        irr = bond.get('secondary_irr', bond.get('primary_irr', 12))
        
        for idx, row in df.iterrows():
            date_val = row.get(date_col)
            expected_price = row.get(price_col)
            
            # Skip empty rows
            if pd.isna(date_val) or pd.isna(expected_price):
                continue
            
            total_rows += 1
            
            try:
                # Parse date
                if isinstance(date_val, str):
                    investment_date = pd.to_datetime(date_val).strftime('%Y-%m-%d')
                else:
                    investment_date = pd.to_datetime(date_val).strftime('%Y-%m-%d')
                
                expected_price = float(expected_price)
                
                # Calculate system price using the existing function
                calc_result = calculate_secondary_market_price_and_units(
                    bond=bond,
                    investment_date_str=investment_date,
                    irr=irr,
                    cutoff_days=cutoff_days
                )
                
                system_price = round(calc_result.get('price_per_unit', 0), 2)
                expected_price_rounded = round(expected_price, 2)
                
                # Exact match comparison
                is_match = system_price == expected_price_rounded
                
                if is_match:
                    matched_rows += 1
                else:
                    mismatched_rows += 1
                    all_matched = False
                
                comparison_results.append({
                    "row": idx + 2,  # Excel row number (1-indexed + header)
                    "date": investment_date,
                    "expected_price": expected_price_rounded,
                    "system_price": system_price,
                    "difference": round(system_price - expected_price_rounded, 2),
                    "match": is_match
                })
                
            except Exception as e:
                comparison_results.append({
                    "row": idx + 2,
                    "date": str(date_val),
                    "error": str(e),
                    "match": False
                })
                all_matched = False
                mismatched_rows += 1
        
        if total_rows == 0:
            raise HTTPException(status_code=400, detail="No valid data rows found in the Excel file")
        
        # If all prices match, update listing_status to 'active'
        if all_matched:
            await db.bonds.update_one(
                {"id": bond_id},
                {"$set": {
                    "listing_status": "active",
                    "price_verified_at": datetime.now(timezone.utc).isoformat(),
                    "price_verified_by": current_user['id']
                }}
            )
        
        return {
            "bond_id": bond_id,
            "bond_code": bond.get('bond_code'),
            "bond_name": bond.get('name'),
            "verification_passed": all_matched,
            "listing_status": "active" if all_matched else "pending",
            "summary": {
                "total_dates_checked": total_rows,
                "matched": matched_rows,
                "mismatched": mismatched_rows
            },
            "comparison_details": comparison_results,
            "message": "All prices matched! Bond is now listed as ACTIVE." if all_matched else f"Price verification failed. {mismatched_rows} date(s) have mismatched prices."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing Excel file: {str(e)}")


@api_router.post("/bonds/{bond_id}/activate")
async def activate_bond(
    bond_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually activate a bond (set listing_status to 'active').
    Use this only if you want to bypass price verification.
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can activate bonds")
    
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {
            "listing_status": "active",
            "activated_at": datetime.now(timezone.utc).isoformat(),
            "activated_by": current_user['id']
        }}
    )
    
    return {
        "message": "Bond activated successfully",
        "listing_status": "active"
    }


@api_router.post("/bonds/{bond_id}/deactivate")
async def deactivate_bond(
    bond_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Deactivate a bond (set listing_status to 'pending').
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can deactivate bonds")
    
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {
            "listing_status": "pending",
            "deactivated_at": datetime.now(timezone.utc).isoformat(),
            "deactivated_by": current_user['id']
        }}
    )
    
    return {
        "message": "Bond deactivated successfully",
        "listing_status": "pending"
    }
async def upload_bond_presentations(
    bond_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload presentation files for a bond (max 10 files)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload presentations")
    
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    current_presentations = bond.get('presentations', [])
    
    if len(current_presentations) + len(files) > 10:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum 10 presentations allowed. Currently have {len(current_presentations)}, trying to add {len(files)}"
        )
    
    allowed_types = ['application/pdf', 
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/vnd.ms-powerpoint',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    
    new_presentations = []
    
    upload_dir = "/app/uploads/bond_presentations"
    os.makedirs(upload_dir, exist_ok=True)
    
    for file in files:
        if file.content_type not in allowed_types:
            continue
        
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
        saved_filename = f"{bond_id}_{uuid.uuid4().hex[:8]}.{file_extension}"
        file_path = os.path.join(upload_dir, saved_filename)
        
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        presentation_data = {
            "id": str(uuid.uuid4()),
            "original_filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "url": f"/uploads/bond_presentations/{saved_filename}",
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        new_presentations.append(presentation_data)
    
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {"presentations": current_presentations + new_presentations}}
    )
    
    return {
        "message": f"Uploaded {len(new_presentations)} presentation(s)",
        "presentations": new_presentations
    }


@api_router.delete("/bonds/{bond_id}/presentations/{presentation_id}")
async def delete_bond_presentation(
    bond_id: str,
    presentation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a presentation from a bond"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete presentations")
    
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    presentations = bond.get('presentations', [])
    presentation = next((p for p in presentations if p['id'] == presentation_id), None)
    
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    
    # Try to delete file
    try:
        file_path = f"/app{presentation['url']}"
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        pass
    
    updated_presentations = [p for p in presentations if p['id'] != presentation_id]
    
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {"presentations": updated_presentations}}
    )
    
    return {"message": "Presentation deleted"}


@api_router.post("/bonds/{bond_id}/download-cashflow", response_model=CashflowDownload)
async def download_cashflow(bond_id: str, calculation: SecondaryMarketCalculation):
    """Generate month-wise cashflow with TDS calculation - using record date logic"""
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    investment_date = datetime.fromisoformat(calculation.investment_date)
    units = calculation.units
    cutoff_days = bond.get('cutoff_days', 15)  # Record date convention
    
    # Calculate price per unit using record date logic
    secondary_irr_decimal = bond['secondary_irr'] / 100
    
    # Check if bond uses cashflows_per_unit format (new format)
    if bond.get('cashflows_per_unit') and len(bond.get('cashflows_per_unit', [])) > 0:
        # New format: cashflows_per_unit contains date, interest_per_unit, principal_per_unit
        cashflows_data = bond['cashflows_per_unit']
        
        # Build cashflow schedule - Only include cashflows FROM investment date onwards
        cashflows = []
        total_principal = 0
        total_interest = 0
        total_tds = 0
        
        for cf in cashflows_data:
            cf_date = datetime.fromisoformat(str(cf.get('date', '')).split('T')[0].split(' ')[0])
            days_from_investment = (cf_date - investment_date).days
            
            # Only include cashflows that are MORE than cutoff_days from investment (buyer receives these)
            if days_from_investment > cutoff_days:
                # Support both 'interest' and 'interest_per_unit' keys
                interest_per_unit = cf.get('interest', cf.get('interest_per_unit', 0)) or 0
                principal_per_unit = cf.get('principal', cf.get('principal_per_unit', 0)) or 0
                
                # Multiply by units
                interest_payment = interest_per_unit * units
                principal_payment = principal_per_unit * units
                
                # Calculate TDS on interest
                tds_deducted = interest_payment * 0.10
                net_interest = interest_payment - tds_deducted
                total_net_payment = principal_payment + net_interest
                
                total_principal += principal_payment
                total_interest += interest_payment
                total_tds += tds_deducted
                
                cashflows.append({
                    "date": cf_date.isoformat(),
                    "month": cf_date.strftime("%B %Y"),
                    "principal_payment": round(principal_payment, 2),
                    "interest_payment": round(interest_payment, 2),
                    "tds_deducted": round(tds_deducted, 2),
                    "net_interest": round(net_interest, 2),
                    "total_net_payment": round(total_net_payment, 2)
                })
        
        # Calculate discounted price
        remaining_dates = []
        remaining_cashflows = []
        for cf in cashflows_data:
            cf_date = datetime.fromisoformat(str(cf.get('date', '')).split('T')[0].split(' ')[0])
            days_from_investment = (cf_date - investment_date).days
            if days_from_investment > cutoff_days:
                interest = cf.get('interest', cf.get('interest_per_unit', 0)) or 0
                principal = cf.get('principal', cf.get('principal_per_unit', 0)) or 0
                remaining_dates.append(cf_date)
                remaining_cashflows.append(interest + principal)
        
        price_per_unit = calculate_price_for_irr(secondary_irr_decimal, remaining_dates, remaining_cashflows, investment_date)
        total_price = price_per_unit * units
        
        return {
            "bond_name": bond['name'],
            "investment_date": calculation.investment_date,
            "units": units,
            "price_paid": round(total_price, 2),
            "cashflows": cashflows,
            "total_principal": round(total_principal, 2),
            "total_interest": round(total_interest, 2),
            "total_tds": round(total_tds, 2),
            "total_net_received": round(total_principal + total_interest - total_tds, 2)
        }
    
    # Old format: interest_payments and principal_payments arrays
    remaining_dates = []
    remaining_cashflows = []
    
    for ip in bond.get('interest_payments', []):
        ip_date = datetime.fromisoformat(ip['date'])
        days_from_investment = (ip_date - investment_date).days
        if days_from_investment > cutoff_days:
            remaining_dates.append(ip_date)
            remaining_cashflows.append(ip['amount'])
    
    for pp in bond.get('principal_payments', []):
        pp_date = datetime.fromisoformat(pp['date'])
        days_from_investment = (pp_date - investment_date).days
        if days_from_investment > cutoff_days:
            remaining_dates.append(pp_date)
            remaining_cashflows.append(bond.get('principal_amount', bond.get('face_value', 0)) * pp['percentage'] / 100)
    
    date_cashflow_map = {}
    for d, cf in zip(remaining_dates, remaining_cashflows):
        if d in date_cashflow_map:
            date_cashflow_map[d] += cf
        else:
            date_cashflow_map[d] = cf
    
    remaining_dates = sorted(date_cashflow_map.keys())
    remaining_cashflows = [date_cashflow_map[d] for d in remaining_dates]
    
    price_per_unit = calculate_price_for_irr(secondary_irr_decimal, remaining_dates, remaining_cashflows, investment_date)
    total_price = price_per_unit * units
    
    # Build cashflow schedule - MULTIPLY BY UNITS
    cashflows = []
    total_principal = 0
    total_interest = 0
    total_tds = 0
    
    for payment_date in sorted(date_cashflow_map.keys()):
        days_from_investment = (payment_date - investment_date).days
        
        # Skip payments within cutoff
        if days_from_investment <= cutoff_days:
            continue
        
        # Separate principal and interest for this date
        principal_payment = 0
        interest_payment = 0
        
        # Check principal payments
        for pp in bond.get('principal_payments', []):
            pp_date = datetime.fromisoformat(pp['date'])
            if pp_date == payment_date:
                principal_payment += (bond.get('principal_amount', bond.get('face_value', 0)) * pp['percentage'] / 100) * units
        
        # Check interest payments
        for ip in bond.get('interest_payments', []):
            ip_date = datetime.fromisoformat(ip['date'])
            if ip_date == payment_date:
                interest_payment += ip['amount'] * units
        
        # Calculate TDS on interest
        tds_deducted = interest_payment * 0.10
        net_interest = interest_payment - tds_deducted
        total_net_payment = principal_payment + net_interest
        
        total_principal += principal_payment
        total_interest += interest_payment
        total_tds += tds_deducted
        
        cashflows.append({
            "date": payment_date.isoformat(),
            "month": payment_date.strftime("%B %Y"),
            "principal_payment": round(principal_payment, 2),
            "interest_payment": round(interest_payment, 2),
            "tds_deducted": round(tds_deducted, 2),
            "net_interest": round(net_interest, 2),
            "total_net_payment": round(total_net_payment, 2)
        })
    
    return {
        "bond_name": bond['name'],
        "investment_date": calculation.investment_date,
        "units": units,
        "price_paid": round(total_price, 2),
        "cashflows": cashflows,
        "total_principal": round(total_principal, 2),
        "total_interest": round(total_interest, 2),
        "total_tds": round(total_tds, 2),
        "total_net_received": round(total_principal + total_interest - total_tds, 2)
    }


# ==================== REAL ESTATE OPPORTUNITY ====================

class PaymentScheduleItem(BaseModel):
    date: str  # YYYY-MM-DD
    percentage: float  # e.g., 20.0 for 20%
    description: Optional[str] = None  # e.g., "Booking", "During Construction", "Handover"


class RealEstateOpportunityCreate(BaseModel):
    # Basic Information
    building_name: str
    unit_no: str
    
    # Pricing (in AED)
    unit_price: float
    
    # DLD Fee (percentage of unit price) - paid upfront with booking
    dld_fee_percentage: float = 4.0
    
    # Admin Fee (absolute amount) - paid upfront with booking
    admin_fee: float = 0
    
    # Other Fees
    broker_fee: float = 0
    other_fees: float = 0
    
    # Developer Discount
    developer_discount: float = 0  # Absolute discount amount (AED)
    developer_discount_percentage: float = 0  # Discount as percentage
    
    # Unit Selling Fee (% of selling price, 0-2.5%)
    unit_selling_fee_percentage: float = 0
    
    # Area Details (sq.ft)
    total_area: float
    carpet_area: float
    balcony_area: float = 0
    
    # Unit Details
    unit_type: str
    floor: int
    parking_spaces: int = 0
    
    # Payment Schedule - percentages based on unit price only (excludes DLD/Admin)
    payment_schedule: List[PaymentScheduleItem] = []
    
    # Sale Settings
    expected_sale_rate: Optional[float] = None
    estimated_sell_date: Optional[str] = None
    eligible_to_sell_after_percentage: float = 100
    
    # Optional Details
    developer_name: Optional[str] = None
    location: Optional[str] = None
    handover_date: Optional[str] = None
    description: Optional[str] = None
    view_3d_url: Optional[str] = None


class RealEstateOpportunityUpdate(BaseModel):
    building_name: Optional[str] = None
    unit_no: Optional[str] = None
    unit_price: Optional[float] = None
    dld_fee_percentage: Optional[float] = None
    dld_fee: Optional[float] = None
    admin_fee: Optional[float] = None
    broker_fee: Optional[float] = None
    brokerage_fee: Optional[float] = None
    other_fees: Optional[float] = None
    selling_fee_percentage: Optional[float] = None
    unit_selling_fee_percentage: Optional[float] = None
    total_area: Optional[float] = None
    carpet_area: Optional[float] = None
    balcony_area: Optional[float] = None
    unit_type: Optional[str] = None
    floor: Optional[str] = None
    parking_spaces: Optional[int] = None
    payment_schedule: Optional[List[PaymentScheduleItem]] = None
    expected_sale_rate: Optional[float] = None
    estimated_sell_date: Optional[str] = None
    eligible_to_sell_after_percentage: Optional[float] = None
    developer_name: Optional[str] = None
    location: Optional[str] = None
    handover_date: Optional[str] = None
    description: Optional[str] = None
    developer_discount: Optional[float] = None
    developer_discount_percentage: Optional[float] = None
    view_3d_url: Optional[str] = None


class InvestorAllocation(BaseModel):
    client_id: str
    share_percentage: float  # Investment percentage (off-plan: percentage based)


# Constants
MAX_FRACTIONAL_INVESTMENT_USD = 50000
USD_TO_AED_RATE = 3.67  # Approximate rate
MAX_FRACTIONAL_INVESTMENT_AED = MAX_FRACTIONAL_INVESTMENT_USD * USD_TO_AED_RATE  # ~183,500 AED


def calculate_payment_schedule(unit_price: float, payment_schedule: List[dict]) -> List[dict]:
    """Calculate actual payment amounts based on percentages"""
    calculated = []
    for payment in payment_schedule:
        amount = unit_price * (payment['percentage'] / 100)
        calculated.append({
            "date": payment['date'],
            "percentage": payment['percentage'],
            "description": payment.get('description', ''),
            "amount": round(amount, 2)
        })
    return calculated


@api_router.post("/real-estate-opportunities")
async def create_real_estate_opportunity(
    opportunity_data: RealEstateOpportunityCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Create a new off-plan real estate opportunity (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can create real estate opportunities")
    
    # Validate unit selling fee percentage (0-2.5%)
    if opportunity_data.unit_selling_fee_percentage < 0 or opportunity_data.unit_selling_fee_percentage > 2.5:
        raise HTTPException(status_code=400, detail="Unit Selling Fee must be between 0% and 2.5%")
    
    # DLD Fee is percentage of unit price
    dld_fee = opportunity_data.unit_price * opportunity_data.dld_fee_percentage / 100
    
    # Admin fee is absolute amount
    admin_fee = opportunity_data.admin_fee
    
    # Upfront amount (DLD + Admin) - paid with booking
    upfront_amount = dld_fee + admin_fee
    
    broker_fee = opportunity_data.broker_fee
    other_fees = opportunity_data.other_fees
    
    # Total cost = Unit Price + all fees
    total_cost = opportunity_data.unit_price + dld_fee + admin_fee + broker_fee + other_fees
    
    # Calculate balcony to carpet ratio
    balcony_ratio = 0
    if opportunity_data.carpet_area > 0:
        balcony_ratio = opportunity_data.balcony_area / opportunity_data.carpet_area
    
    # Payment schedule - percentages based on unit price only
    # DLD + Admin are paid upfront with booking (not part of payment schedule percentages)
    payment_schedule = []
    if opportunity_data.payment_schedule:
        payment_schedule = calculate_payment_schedule(
            opportunity_data.unit_price,  # Based on unit price only
            [p.model_dump() for p in opportunity_data.payment_schedule]
        )
    
    # Validate payment schedule totals to 100%
    if payment_schedule:
        total_percentage = sum(p['percentage'] for p in payment_schedule)
        if abs(total_percentage - 100) > 0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Payment schedule must total 100%. Current total: {total_percentage}%"
            )
    
    opportunity_dict = {
        "id": str(uuid.uuid4()),
        "building_name": opportunity_data.building_name,
        "unit_no": opportunity_data.unit_no,
        "property_type": "off_plan",  # Only off-plan supported
        "unit_price": opportunity_data.unit_price,
        "dld_fee_percentage": opportunity_data.dld_fee_percentage,
        "dld_fee": round(dld_fee, 2),
        "admin_fee": round(admin_fee, 2),
        "upfront_amount": round(upfront_amount, 2),  # DLD + Admin (paid with booking)
        "broker_fee": broker_fee,
        "other_fees": other_fees,
        "developer_discount": opportunity_data.developer_discount,
        "developer_discount_percentage": opportunity_data.developer_discount_percentage,
        "unit_selling_fee_percentage": opportunity_data.unit_selling_fee_percentage,
        "total_cost": round(total_cost, 2),
        "total_area": opportunity_data.total_area,
        "carpet_area": opportunity_data.carpet_area,
        "balcony_area": opportunity_data.balcony_area,
        "balcony_ratio": round(balcony_ratio, 4),
        "unit_type": opportunity_data.unit_type,
        "floor": opportunity_data.floor,
        "parking_spaces": opportunity_data.parking_spaces,
        "payment_schedule": payment_schedule,
        "total_payment_percentage_completed": 0,
        "expected_sale_rate": opportunity_data.expected_sale_rate,
        "estimated_sell_date": opportunity_data.estimated_sell_date,
        "eligible_to_sell_after_percentage": opportunity_data.eligible_to_sell_after_percentage,
        "is_eligible_to_sell": False,
        "max_investors": 4,  # Off-plan: max 4 investors
        "current_investors": 0,
        "total_invested": 0,
        "invested_percentage": 0,
        "remaining_percentage": 100,
        "investors": [],
        "developer_name": opportunity_data.developer_name,
        "location": opportunity_data.location,
        "handover_date": opportunity_data.handover_date,
        "description": opportunity_data.description,
        "view_3d_url": opportunity_data.view_3d_url,
        "images": [],
        "status": "available",
        "created_by": current_user['id'],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.real_estate_opportunities.insert_one(opportunity_dict)
    
    # Remove _id for response
    if '_id' in opportunity_dict:
        del opportunity_dict['_id']
    
    return opportunity_dict


@api_router.get("/real-estate-opportunities")
async def get_real_estate_opportunities(
    status: Optional[str] = None,
    property_type: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get all real estate opportunities with pagination and optimized fields"""
    query = {}
    
    # All roles can see all real estate opportunities
    # (Similar to bonds - brokers see all, sub-brokers see all, clients see available)
    if current_user['role'] == 'client':
        # Clients only see available opportunities
        query["status"] = {"$in": ["available", "partially_invested"]}
    
    if status:
        query["status"] = status
    
    if property_type:
        query["property_type"] = property_type
    
    # Optimized projection - include all fields needed for list view and edit
    projection = {
        "_id": 0,
        "id": 1,
        "building_name": 1,
        "project_name": 1,
        "developer_name": 1,
        "unit_no": 1,
        "unit_type": 1,
        "location": 1,
        "floor": 1,
        "parking_spaces": 1,
        "description": 1,
        "total_area": 1,
        "carpet_area": 1,
        "balcony_area": 1,
        "total_cost": 1,
        "unit_price": 1,
        "dld_fee": 1,
        "dld_fee_percentage": 1,
        "admin_fee": 1,
        "broker_fee": 1,
        "brokerage_fee": 1,
        "other_fees": 1,
        "developer_discount": 1,
        "developer_discount_percentage": 1,
        "unit_selling_fee_percentage": 1,
        "selling_fee_percentage": 1,
        "price_per_sqft": 1,
        "expected_xirr": 1,
        "expected_sale_rate": 1,
        "estimated_sell_date": 1,
        "eligible_to_sell_after_percentage": 1,
        "payment_schedule": 1,
        "status": 1,
        "invested_percentage": 1,
        "max_co_owners": 1,
        "handover_date": 1,
        "view_3d_url": 1,
        "images": 1,
        "presentations": 1,
        "created_at": 1,
        "investors": 1,
        "interested_count": 1,
        "current_investors": 1,
        "total_payment_percentage_completed": 1,
    }
    
    skip = (page - 1) * limit
    
    opportunities = await db.real_estate_opportunities.find(
        query, projection
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get total count for pagination info
    total = await db.real_estate_opportunities.count_documents(query)
    
    return {
        "data": opportunities,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit
        }
    }


@api_router.get("/real-estate-opportunities/client/{client_id}")
async def get_client_real_estate_investments(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all real estate investments for a specific client (broker/sub-broker only)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can view client investments")
    
    # Find all opportunities where this client is an investor
    opportunities = await db.real_estate_opportunities.find(
        {"investors.client_id": client_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Transform data to show client-specific information
    client_investments = []
    for opp in opportunities:
        investor = next((inv for inv in opp.get('investors', []) if inv.get('client_id') == client_id), None)
        if investor:
            # Count completed payments for this client
            client_payments = [p for p in opp.get('investor_payments', []) if p.get('investor_id') == client_id and p.get('status') == 'verified']
            total_milestones = len(opp.get('payment_schedule', []))
            
            client_investments.append({
                "id": opp.get('id'),
                "building_name": opp.get('building_name'),
                "project_name": opp.get('project_name'),
                "developer_name": opp.get('developer_name'),
                "unit_no": opp.get('unit_no'),
                "unit_price": opp.get('unit_price'),
                "status": opp.get('status'),
                "share_percentage": investor.get('share_percentage', 0),
                "investment_amount": investor.get('amount', 0),
                "invested_at": investor.get('invested_at'),
                "payment_schedule": opp.get('payment_schedule', []),
                "payments_completed": len(client_payments),
                "payments_completed_percent": round((len(client_payments) / total_milestones * 100) if total_milestones > 0 else 0, 1)
            })
    
    return client_investments


@api_router.get("/real-estate-opportunities/{opportunity_id}")
async def get_real_estate_opportunity(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific real estate opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    return opportunity


@api_router.put("/real-estate-opportunities/{opportunity_id}")
async def update_real_estate_opportunity(
    opportunity_id: str,
    update_data: RealEstateOpportunityUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a real estate opportunity (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update real estate opportunities")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Build update dict with only provided fields
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Handle field name aliases
    if 'unit_selling_fee_percentage' in update_dict:
        update_dict['selling_fee_percentage'] = update_dict.pop('unit_selling_fee_percentage')
    if 'brokerage_fee' in update_dict and 'broker_fee' not in update_dict:
        update_dict['broker_fee'] = update_dict.pop('brokerage_fee')
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Recalculate totals if any pricing field changed
    if any(k in update_dict for k in ['unit_price', 'dld_fee', 'admin_fee', 'broker_fee', 'brokerage_fee', 'other_fees']):
        unit_price = update_dict.get('unit_price', opportunity.get('unit_price', 0))
        dld_fee = update_dict.get('dld_fee', opportunity.get('dld_fee', 0))
        admin_fee = update_dict.get('admin_fee', opportunity.get('admin_fee', 0))
        broker_fee = update_dict.get('broker_fee', opportunity.get('broker_fee', opportunity.get('brokerage_fee', 0)))
        other_fees = update_dict.get('other_fees', opportunity.get('other_fees', 0))
        
        total_cost = unit_price + dld_fee + admin_fee + broker_fee + other_fees
        update_dict['total_cost'] = total_cost
        
        # Recalculate units
        UNIT_VALUE_AED = 500
        total_units = int(total_cost // UNIT_VALUE_AED)
        if total_units == 0:
            total_units = 1
        update_dict['total_units'] = total_units
        update_dict['unit_value'] = UNIT_VALUE_AED
        units_sold = opportunity.get('units_sold', 0)
        update_dict['units_available'] = total_units - units_sold
    
    # Recalculate balcony ratio if area fields changed
    if any(k in update_dict for k in ['carpet_area', 'balcony_area']):
        carpet_area = update_dict.get('carpet_area', opportunity.get('carpet_area', 0))
        balcony_area = update_dict.get('balcony_area', opportunity.get('balcony_area', 0))
        if carpet_area and carpet_area > 0:
            update_dict['balcony_ratio'] = round(balcony_area / carpet_area, 4)
    
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": update_dict}
    )
    
    updated = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    return updated


@api_router.delete("/real-estate-opportunities/{opportunity_id}")
async def delete_real_estate_opportunity(
    opportunity_id: str,
    force: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Delete a real estate opportunity (broker only)
    
    Args:
        opportunity_id: ID of the opportunity to delete
        force: If True, delete even if there are investors (use with caution)
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete real estate opportunities")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    investor_count = opportunity.get('current_investors', 0)
    if investor_count > 0 and not force:
        raise HTTPException(
            status_code=400, 
            detail=f"This property has {investor_count} investor(s). Add ?force=true to delete anyway."
        )
    
    await db.real_estate_opportunities.delete_one({"id": opportunity_id})
    
    return {"message": "Real estate opportunity deleted successfully"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/images")
async def upload_opportunity_images(
    opportunity_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload images for a real estate opportunity (max 20 images)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload images")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    current_images = opportunity.get('images', [])
    
    # Check total image limit
    if len(current_images) + len(files) > 20:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum 20 images allowed. Currently have {len(current_images)}, trying to add {len(files)}"
        )
    
    # Validate file types
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    new_images = []
    
    for file in files:
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file type: {file.content_type}. Allowed: JPEG, PNG, WebP, GIF"
            )
        
        # Read file content and encode as base64 for storage
        # In production, you'd upload to cloud storage (S3, etc.)
        content = await file.read()
        import base64
        encoded = base64.b64encode(content).decode('utf-8')
        
        image_data = {
            "id": str(uuid.uuid4()),
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "data": encoded,  # Base64 encoded
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        new_images.append(image_data)
    
    # Update opportunity with new images
    updated_images = current_images + new_images
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"images": updated_images, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "message": f"Successfully uploaded {len(new_images)} images",
        "total_images": len(updated_images),
        "image_ids": [img['id'] for img in new_images]
    }


@api_router.delete("/real-estate-opportunities/{opportunity_id}/images/{image_id}")
async def delete_opportunity_image(
    opportunity_id: str,
    image_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a specific image from a real estate opportunity"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete images")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    current_images = opportunity.get('images', [])
    updated_images = [img for img in current_images if img['id'] != image_id]
    
    if len(updated_images) == len(current_images):
        raise HTTPException(status_code=404, detail="Image not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"images": updated_images, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Image deleted successfully", "remaining_images": len(updated_images)}


@api_router.post("/real-estate-opportunities/{opportunity_id}/presentations")
async def upload_opportunity_presentations(
    opportunity_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload presentation files for a real estate opportunity (max 10 files)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload presentations")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    current_presentations = opportunity.get('presentations', [])
    
    # Check total presentation limit
    if len(current_presentations) + len(files) > 10:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum 10 presentations allowed. Currently have {len(current_presentations)}, trying to add {len(files)}"
        )
    
    # Validate file types
    allowed_types = [
        'application/pdf', 
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    new_presentations = []
    
    # Create uploads directory if not exists
    import os
    upload_dir = "/app/uploads/presentations"
    os.makedirs(upload_dir, exist_ok=True)
    
    for file in files:
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file type: {file.content_type}. Allowed: PDF, PPT, PPTX, DOC, DOCX"
            )
        
        # Save file to disk
        file_id = str(uuid.uuid4())
        file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
        saved_filename = f"{file_id}.{file_ext}"
        file_path = os.path.join(upload_dir, saved_filename)
        
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        presentation_data = {
            "id": file_id,
            "filename": file.filename,
            "saved_filename": saved_filename,
            "content_type": file.content_type,
            "size": len(content),
            "url": f"/uploads/presentations/{saved_filename}",
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        new_presentations.append(presentation_data)
    
    # Update opportunity with new presentations
    updated_presentations = current_presentations + new_presentations
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"presentations": updated_presentations, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "message": f"Successfully uploaded {len(new_presentations)} presentations",
        "total_presentations": len(updated_presentations),
        "presentation_ids": [pres['id'] for pres in new_presentations]
    }


@api_router.delete("/real-estate-opportunities/{opportunity_id}/presentations/{presentation_id}")
async def delete_real_estate_presentation(
    opportunity_id: str,
    presentation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a presentation from a real estate opportunity"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete presentations")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id,
        "created_by": current_user['id']
    }, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    presentations = opportunity.get('presentations', [])
    presentation = next((p for p in presentations if p['id'] == presentation_id), None)
    
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    
    # Remove the file from disk if it exists
    import os
    file_path = f"/app/uploads/presentations/{presentation.get('saved_filename', '')}"
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Update the opportunity to remove this presentation
    updated_presentations = [p for p in presentations if p['id'] != presentation_id]
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"presentations": updated_presentations, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Presentation deleted successfully", "remaining_presentations": len(updated_presentations)}
async def download_presentation(
    opportunity_id: str,
    presentation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download a presentation file"""
    from fastapi.responses import FileResponse
    import os
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    presentations = opportunity.get('presentations', [])
    presentation = next((p for p in presentations if p['id'] == presentation_id), None)
    
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    
    file_path = f"/app/uploads/presentations/{presentation['saved_filename']}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    
    return FileResponse(
        path=file_path,
        filename=presentation['filename'],
        media_type=presentation['content_type']
    )


# Passport Details for Real Estate Investors
class PassportDetails(BaseModel):
    passport_number: Optional[str] = None
    date_of_issue: Optional[str] = None
    date_of_expiry: Optional[str] = None
    place_of_issue: Optional[str] = None
    country_of_issue: Optional[str] = None
    address_on_passport: Optional[str] = None


@api_router.post("/real-estate-opportunities/{opportunity_id}/investor/{investor_id}/passport")
async def update_investor_passport(
    opportunity_id: str,
    investor_id: str,
    passport: PassportDetails,
    current_user: dict = Depends(get_current_user)
):
    """Update passport details for an investor in a real estate opportunity"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    investors = opportunity.get('investors', [])
    investor_found = False
    
    for inv in investors:
        if inv['id'] == investor_id:
            inv['passport_details'] = passport.model_dump()
            inv['passport_updated_at'] = datetime.now(timezone.utc).isoformat()
            investor_found = True
            break
    
    if not investor_found:
        raise HTTPException(status_code=404, detail="Investor not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investors": investors, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Passport details updated successfully"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/investor/{investor_id}/passport-upload")
async def upload_passport_document(
    opportunity_id: str,
    investor_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload passport document for an investor"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    # Validate file type
    allowed_types = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PDF and image files are allowed")
    
    # Create uploads directory if not exists
    import os
    upload_dir = "/app/uploads/passports"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Save file
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    saved_filename = f"{investor_id}_{uuid.uuid4()}.{file_ext}"
    file_path = f"{upload_dir}/{saved_filename}"
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Update investor record
    investors = opportunity.get('investors', [])
    for inv in investors:
        if inv['id'] == investor_id:
            inv['passport_document'] = {
                'filename': file.filename,
                'saved_filename': saved_filename,
                'content_type': file.content_type,
                'uploaded_at': datetime.now(timezone.utc).isoformat()
            }
            break
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investors": investors, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Passport document uploaded successfully", "filename": saved_filename}


@api_router.get("/real-estate-opportunities/{opportunity_id}/investor/{investor_id}/passport-download")
async def download_passport_document(
    opportunity_id: str,
    investor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download passport document for an investor"""
    from fastapi.responses import FileResponse
    import os
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    investors = opportunity.get('investors', [])
    investor = next((inv for inv in investors if inv['id'] == investor_id), None)
    
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found")
    
    passport_doc = investor.get('passport_document')
    if not passport_doc:
        raise HTTPException(status_code=404, detail="No passport document uploaded")
    
    file_path = f"/app/uploads/passports/{passport_doc['saved_filename']}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    
    return FileResponse(
        path=file_path,
        filename=passport_doc['filename'],
        media_type=passport_doc['content_type']
    )


@api_router.post("/real-estate-opportunities/{opportunity_id}/invest")
async def invest_in_opportunity(
    opportunity_id: str,
    allocation: InvestorAllocation,
    current_user: dict = Depends(get_current_user)
):
    """
    Allocate investment in an off-plan property (percentage-based, max 4 investors)
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can allocate investments")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Allow investment for both 'available' and 'partially_invested' status
    if opportunity.get('status') not in ['available', 'partially_invested', None]:
        raise HTTPException(status_code=400, detail="This opportunity is no longer available for investment")
    
    # Verify client exists
    client = await db.clients.find_one({"id": allocation.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # OFF-PLAN: Percentage-based (max 4 investors)
    max_investors = opportunity.get('max_investors', 4)
    if opportunity.get('current_investors', 0) >= max_investors:
        raise HTTPException(status_code=400, detail=f"Maximum {max_investors} investors allowed")
    
    remaining_percentage = opportunity.get('remaining_percentage', 100)
    total_cost = opportunity.get('total_cost', 0)
    
    share_percentage = allocation.share_percentage
    if share_percentage <= 0:
        raise HTTPException(status_code=400, detail="Investment percentage must be greater than 0")
    if share_percentage > remaining_percentage:
        raise HTTPException(status_code=400, detail=f"Only {remaining_percentage:.1f}% remaining for investment")
    
    investment_amount = total_cost * share_percentage / 100
    
    # Create investor record with payment schedule tracking
    investor_record = {
        "id": str(uuid.uuid4()),
        "client_id": allocation.client_id,
        "client_name": client['name'],
        "amount": round(investment_amount, 2),
        "share_percentage": round(share_percentage, 2),
        "invested_at": datetime.now(timezone.utc).isoformat(),
        "recorded_by": current_user['id'],
        # Payment tracking per investor (to be filled when payments are made)
        "payments": []
    }
    
    new_total_invested = opportunity.get('total_invested', 0) + investment_amount
    new_invested_percentage = opportunity.get('invested_percentage', 0) + share_percentage
    new_remaining_percentage = 100 - new_invested_percentage
    
    update_data = {
        "current_investors": opportunity.get('current_investors', 0) + 1,
        "total_invested": round(new_total_invested, 2),
        "invested_percentage": round(new_invested_percentage, 2),
        "remaining_percentage": round(new_remaining_percentage, 2),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Check if fully invested - ONLY when 100% is allocated (not just max investors)
    if new_remaining_percentage <= 0.01:
        update_data['status'] = 'fully_invested'
    elif new_invested_percentage > 0:
        update_data['status'] = 'partially_invested'
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {
            "$set": update_data,
            "$push": {"investors": investor_record}
        }
    )
    
    return {
        "message": "Investment recorded successfully",
        "investor": investor_record,
        "total_invested": update_data.get('total_invested'),
        "remaining_percentage": update_data.get('remaining_percentage'),
        "status": update_data.get('status', opportunity['status'])
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/investors")
async def get_opportunity_investors(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of investors for an opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    return {
        "opportunity_id": opportunity_id,
        "building_name": opportunity['building_name'],
        "unit_no": opportunity['unit_no'],
        "property_type": opportunity['property_type'],
        "total_cost": opportunity['total_cost'],
        "total_invested": opportunity.get('total_invested', 0),
        "unit_value": opportunity.get('unit_value', 500),
        "total_units": opportunity.get('total_units', 0),
        "units_sold": opportunity.get('units_sold', 0),
        "units_available": opportunity.get('units_available', 0),
        "current_investors": opportunity.get('current_investors', 0),
        "investors": opportunity.get('investors', [])
    }


class PaymentRecordRequest(BaseModel):
    payment_index: int
    payment_date: str  # Date payment was made
    transaction_amount: float  # Actual amount paid
    transaction_fees: float = 0  # Bank/transfer fees
    currency: str = "AED"  # Currency used
    currency_rate: float = 1.0  # Exchange rate if not AED
    notes: Optional[str] = None


@api_router.post("/real-estate-opportunities/{opportunity_id}/record-payment")
async def record_payment_milestone(
    opportunity_id: str,
    payment_data: PaymentRecordRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark a payment milestone as completed with full transaction details.
    Allowed for: broker, sub_broker, client (if tagged to this investment)
    """
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Check authorization
    user_role = current_user['role']
    user_id = current_user['id']
    
    if user_role == 'broker':
        # Broker must own this opportunity
        if opportunity.get('created_by') != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        # Sub-broker must have a client invested in this opportunity
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        # Get clients linked to this sub-broker
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="No linked clients invested in this property")
    elif user_role == 'client':
        # Client must be an investor
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        # Get client record for this user
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or client['id'] not in investor_client_ids:
            raise HTTPException(status_code=403, detail="You are not invested in this property")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payment_schedule = opportunity.get('payment_schedule', [])
    payment_index = payment_data.payment_index
    
    if payment_index < 0 or payment_index >= len(payment_schedule):
        raise HTTPException(status_code=400, detail="Invalid payment index")
    
    # Update payment with full details
    payment_schedule[payment_index]['completed'] = True
    payment_schedule[payment_index]['completed_at'] = datetime.now(timezone.utc).isoformat()
    payment_schedule[payment_index]['payment_details'] = {
        "payment_date": payment_data.payment_date,
        "transaction_amount": payment_data.transaction_amount,
        "transaction_fees": payment_data.transaction_fees,
        "currency": payment_data.currency,
        "currency_rate": payment_data.currency_rate,
        "amount_in_aed": payment_data.transaction_amount * payment_data.currency_rate,
        "notes": payment_data.notes,
        "recorded_by": user_id,
        "recorded_by_role": user_role,
        "recorded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Calculate total completed percentage
    total_completed = sum(p['percentage'] for p in payment_schedule if p.get('completed'))
    
    # Check if eligible to sell
    eligible_threshold = opportunity.get('eligible_to_sell_after_percentage', 100)
    is_eligible = total_completed >= eligible_threshold
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {
            "payment_schedule": payment_schedule,
            "total_payment_percentage_completed": total_completed,
            "is_eligible_to_sell": is_eligible,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "Payment recorded successfully",
        "payment": payment_schedule[payment_index],
        "total_completed_percentage": total_completed,
        "is_eligible_to_sell": is_eligible
    }


@api_router.post("/real-estate-opportunities/{opportunity_id}/payments/{payment_index}/swift-copy")
async def upload_swift_copy(
    opportunity_id: str,
    payment_index: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload SWIFT copy for a payment milestone"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Check authorization (same logic as record-payment)
    user_role = current_user['role']
    user_id = current_user['id']
    
    if user_role == 'broker':
        if opportunity.get('created_by') != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'client':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or client['id'] not in investor_client_ids:
            raise HTTPException(status_code=403, detail="Not authorized")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payment_schedule = opportunity.get('payment_schedule', [])
    
    if payment_index < 0 or payment_index >= len(payment_schedule):
        raise HTTPException(status_code=400, detail="Invalid payment index")
    
    # Validate file type
    allowed_types = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: PDF, JPEG, PNG, WebP")
    
    # Read and encode file
    content = await file.read()
    import base64
    encoded = base64.b64encode(content).decode('utf-8')
    
    swift_copy = {
        "id": str(uuid.uuid4()),
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(content),
        "data": encoded,
        "uploaded_by": user_id,
        "uploaded_by_role": user_role,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add or replace swift copy for this payment
    if 'swift_copies' not in payment_schedule[payment_index]:
        payment_schedule[payment_index]['swift_copies'] = []
    
    payment_schedule[payment_index]['swift_copies'].append(swift_copy)
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {
            "payment_schedule": payment_schedule,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "SWIFT copy uploaded successfully",
        "swift_copy_id": swift_copy['id'],
        "filename": file.filename
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/payments")
async def get_payment_schedule(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment schedule for a real estate opportunity.
    Accessible by: broker (owner), sub-broker (if client invested), client (if invested)
    """
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Check authorization
    user_role = current_user['role']
    user_id = current_user['id']
    authorized = False
    
    if user_role == 'broker':
        authorized = opportunity.get('created_by') == user_id
    elif user_role == 'sub_broker':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        authorized = any(cid in investor_client_ids for cid in sub_broker_client_ids)
    elif user_role == 'client':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        authorized = client and client['id'] in investor_client_ids
    
    if not authorized:
        raise HTTPException(status_code=403, detail="Not authorized to view this payment schedule")
    
    # Strip base64 data from swift copies for list view (too large)
    payment_schedule = opportunity.get('payment_schedule', [])
    for payment in payment_schedule:
        if 'swift_copies' in payment:
            for sc in payment['swift_copies']:
                sc['data'] = None  # Remove data, keep metadata
    
    return {
        "opportunity_id": opportunity_id,
        "building_name": opportunity['building_name'],
        "unit_no": opportunity['unit_no'],
        "total_cost": opportunity['total_cost'],
        "unit_price": opportunity['unit_price'],
        "payment_schedule": payment_schedule,
        "total_payment_percentage_completed": opportunity.get('total_payment_percentage_completed', 0),
        "is_eligible_to_sell": opportunity.get('is_eligible_to_sell', False),
        "eligible_to_sell_after_percentage": opportunity.get('eligible_to_sell_after_percentage', 100)
    }


class InterestRequest(BaseModel):
    message: str = ""


@api_router.post("/real-estate-opportunities/{opportunity_id}/interest")
async def express_interest(
    opportunity_id: str,
    request: InterestRequest,
    current_user: dict = Depends(get_current_user)
):
    """Express interest in a real estate opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    interest_record = {
        "id": str(uuid.uuid4()),
        "user_id": current_user['id'],
        "user_name": current_user.get('name', current_user.get('pan_number')),
        "user_role": current_user['role'],
        "message": request.message,
        "expressed_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {
            "$push": {"interests": interest_record},
            "$inc": {"interested_count": 1}
        }
    )
    
    # If interest came from a client, notify the broker who shared it
    if current_user['role'] == 'client':
        # Find the broker who shared this opportunity with this client
        shares = opportunity.get('shares', [])
        for share in shares:
            if share.get('client_id') == current_user['id']:
                # Notify the broker
                notification = {
                    "id": str(uuid.uuid4()),
                    "user_id": share['shared_by'],
                    "type": "client_interested",
                    "title": "Client Showed Interest!",
                    "message": f"{current_user.get('name', 'A client')} expressed interest in {opportunity['building_name']} - Unit {opportunity['unit_no']}",
                    "opportunity_id": opportunity_id,
                    "client_id": current_user['id'],
                    "client_name": current_user.get('name', current_user.get('pan_number')),
                    "client_message": request.message,
                    "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.notifications.insert_one(notification)
                
                # Mark the share as interested
                await db.real_estate_opportunities.update_one(
                    {"id": opportunity_id, "shares.client_id": current_user['id']},
                    {"$set": {"shares.$.interested": True, "shares.$.interested_at": datetime.now(timezone.utc).isoformat()}}
                )
                break
    
    return {"message": "Interest recorded successfully", "interest_id": interest_record['id']}


class ParticipateRequest(BaseModel):
    percentage: float


@api_router.post("/real-estate-opportunities/{opportunity_id}/participate")
async def confirm_participation(
    opportunity_id: str,
    request: ParticipateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Confirm participation as a co-owner in a real estate opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Allow investment for both 'available' and 'partially_invested' status
    if opportunity.get('status') not in ['available', 'partially_invested', None]:
        raise HTTPException(status_code=400, detail="This opportunity is no longer available")
    
    current_investors = opportunity.get('current_investors', 0)
    max_investors = opportunity.get('max_investors', 4)
    
    if current_investors >= max_investors:
        raise HTTPException(status_code=400, detail="Maximum number of investors reached")
    
    # Calculate remaining percentage
    total_allocated = sum(inv.get('share_percentage', 0) for inv in opportunity.get('investors', []))
    remaining_percentage = 100 - total_allocated
    
    if request.percentage > remaining_percentage:
        raise HTTPException(status_code=400, detail=f"Maximum available percentage is {remaining_percentage:.1f}%")
    
    if request.percentage < 1:
        raise HTTPException(status_code=400, detail="Minimum participation is 1%")
    
    # Calculate investment amount
    investment_amount = opportunity['total_cost'] * request.percentage / 100
    
    participation_record = {
        "id": str(uuid.uuid4()),
        "user_id": current_user['id'],
        "user_name": current_user.get('name', current_user.get('pan_number')),
        "user_role": current_user['role'],
        "share_percentage": request.percentage,
        "amount": investment_amount,
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending_payment"  # pending_payment, confirmed, completed
    }
    
    # Update opportunity
    new_total_allocated = total_allocated + request.percentage
    new_total_invested = (opportunity.get('total_invested', 0)) + investment_amount
    new_investor_count = current_investors + 1
    
    update_data = {
        "$push": {"investors": participation_record},
        "$set": {
            "current_investors": new_investor_count,
            "total_invested": new_total_invested,
            "invested_percentage": new_total_allocated,
            "remaining_percentage": 100 - new_total_allocated
        }
    }
    
    # Mark as fully invested ONLY when 100% is allocated
    if new_total_allocated >= 99.99:
        update_data["$set"]["status"] = "fully_invested"
    elif new_total_allocated > 0:
        update_data["$set"]["status"] = "partially_invested"
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        update_data
    )
    
    return {
        "message": "Participation confirmed successfully",
        "participation_id": participation_record['id'],
        "percentage": request.percentage,
        "investment_amount": investment_amount
    }


class UpdateInvestorPercentageRequest(BaseModel):
    investor_id: str  # client_id of the investor
    new_percentage: float


@api_router.put("/real-estate-opportunities/{opportunity_id}/investor-percentage")
async def update_investor_percentage(
    opportunity_id: str,
    request: UpdateInvestorPercentageRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update an investor's share percentage in a real estate opportunity"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can update investor percentages")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    investors = opportunity.get('investors', [])
    
    # Find the investor
    investor_index = None
    old_percentage = 0
    for i, inv in enumerate(investors):
        if inv.get('client_id') == request.investor_id:
            investor_index = i
            old_percentage = inv.get('share_percentage', 0)
            break
    
    if investor_index is None:
        raise HTTPException(status_code=404, detail="Investor not found in this opportunity")
    
    # Calculate total allocated by other investors
    other_investors_total = sum(
        inv.get('share_percentage', 0) for i, inv in enumerate(investors) 
        if i != investor_index
    )
    
    # Check if new percentage is valid
    max_available = 100 - other_investors_total
    if request.new_percentage > max_available:
        raise HTTPException(status_code=400, detail=f"Maximum available percentage is {max_available:.1f}%")
    
    if request.new_percentage < 1:
        raise HTTPException(status_code=400, detail="Minimum percentage is 1%")
    
    # Update the investor's percentage
    investors[investor_index]['share_percentage'] = request.new_percentage
    
    # Recalculate investment amount
    total_cost = opportunity.get('total_cost', opportunity.get('unit_price', 0))
    investors[investor_index]['investment_amount'] = total_cost * request.new_percentage / 100
    
    # Calculate new totals
    new_total_percentage = sum(inv.get('share_percentage', 0) for inv in investors)
    new_total_invested = sum(inv.get('investment_amount', 0) for inv in investors)
    
    # Determine new status
    new_status = opportunity.get('status', 'available')
    if new_total_percentage >= 99.99:
        new_status = 'fully_invested'
    elif new_total_percentage > 0:
        new_status = 'partially_invested'
    else:
        new_status = 'available'
    
    # Update the opportunity
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {
            "investors": investors,
            "invested_percentage": new_total_percentage,
            "remaining_percentage": 100 - new_total_percentage,
            "total_invested": new_total_invested,
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "Investor percentage updated successfully",
        "old_percentage": old_percentage,
        "new_percentage": request.new_percentage,
        "new_investment_amount": investors[investor_index]['investment_amount']
    }


@api_router.delete("/real-estate-opportunities/{opportunity_id}/investor/{investor_id}")
async def remove_investor(
    opportunity_id: str,
    investor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove an investor from a real estate opportunity"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can remove investors")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    investors = opportunity.get('investors', [])
    
    # Find and remove the investor
    removed_investor = None
    new_investors = []
    for inv in investors:
        if inv.get('client_id') == investor_id:
            removed_investor = inv
        else:
            new_investors.append(inv)
    
    if not removed_investor:
        raise HTTPException(status_code=404, detail="Investor not found in this opportunity")
    
    # Calculate new totals
    new_total_percentage = sum(inv.get('share_percentage', 0) for inv in new_investors)
    new_total_invested = sum(inv.get('investment_amount', 0) for inv in new_investors)
    new_investor_count = len(new_investors)
    
    # Determine new status
    if new_investor_count == 0:
        new_status = 'available'
    elif new_total_percentage >= 99.99:
        new_status = 'fully_invested'
    else:
        new_status = 'partially_invested' if new_total_percentage > 0 else 'available'
    
    # Update the opportunity
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {
            "investors": new_investors,
            "current_investors": new_investor_count,
            "invested_percentage": new_total_percentage,
            "remaining_percentage": 100 - new_total_percentage,
            "total_invested": new_total_invested,
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "Investor removed successfully",
        "removed_investor": removed_investor.get('client_name', investor_id),
        "removed_percentage": removed_investor.get('share_percentage', 0)
    }


@api_router.post("/real-estate-opportunities/{opportunity_id}/recalculate-status")
async def recalculate_opportunity_status(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Recalculate and fix the status of a real estate opportunity based on actual allocation"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can recalculate status")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    investors = opportunity.get('investors', [])
    
    # Recalculate totals
    total_percentage = sum(inv.get('share_percentage', 0) for inv in investors)
    total_invested = sum(inv.get('amount', inv.get('investment_amount', 0)) for inv in investors)
    investor_count = len(investors)
    
    # Determine correct status
    if total_percentage >= 99.99:
        new_status = 'fully_invested'
    elif total_percentage > 0:
        new_status = 'partially_invested'
    else:
        new_status = 'available'
    
    old_status = opportunity.get('status', 'available')
    
    # Update the opportunity
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {
            "status": new_status,
            "invested_percentage": round(total_percentage, 2),
            "remaining_percentage": round(100 - total_percentage, 2),
            "total_invested": round(total_invested, 2),
            "current_investors": investor_count,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "Status recalculated successfully",
        "old_status": old_status,
        "new_status": new_status,
        "total_percentage": round(total_percentage, 2),
        "remaining_percentage": round(100 - total_percentage, 2),
        "investor_count": investor_count
    }


class ShareOpportunityRequest(BaseModel):
    client_ids: List[str]
    message: str = ""


@api_router.post("/real-estate-opportunities/{opportunity_id}/share")
async def share_opportunity_with_clients(
    opportunity_id: str,
    request: ShareOpportunityRequest,
    current_user: dict = Depends(get_current_user)
):
    """Share a real estate opportunity with selected clients (broker/sub-broker only)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can share opportunities")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Create share records for each client
    share_records = []
    for client_id in request.client_ids:
        share_record = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "shared_by": current_user['id'],
            "shared_by_name": current_user.get('name', current_user.get('pan_number')),
            "shared_by_role": current_user['role'],
            "message": request.message,
            "shared_at": datetime.now(timezone.utc).isoformat(),
            "viewed": False,
            "interested": False
        }
        share_records.append(share_record)
    
    # Update opportunity with share records
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$push": {"shares": {"$each": share_records}}}
    )
    
    # Create notifications for each client
    for client_id in request.client_ids:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": client_id,
            "type": "opportunity_shared",
            "title": "New Investment Opportunity",
            "message": f"{current_user.get('name', 'Your broker')} shared a real estate opportunity: {opportunity['building_name']} - Unit {opportunity['unit_no']}",
            "opportunity_id": opportunity_id,
            "from_user_id": current_user['id'],
            "from_user_name": current_user.get('name', current_user.get('pan_number')),
            "custom_message": request.message,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    return {
        "message": f"Opportunity shared with {len(request.client_ids)} client(s)",
        "shares_created": len(share_records)
    }


@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Get notifications for the current user"""
    notifications = await db.notifications.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    return notifications


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user['id']},
        {"$set": {"read": True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/upload-invoice")
async def upload_investor_invoice(
    opportunity_id: str,
    milestone_index: int = Form(...),
    investor_id: str = Form(...),
    invoice_number: str = Form(None),
    invoice_date: str = Form(None),
    due_date: str = Form(None),
    notes: str = Form(None),
    invoice_file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an invoice for a specific investor and milestone (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload invoices")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Verify broker owns this opportunity
    if opportunity.get('created_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to upload invoices for this property")
    
    # Verify investor exists in this opportunity
    investor = next((inv for inv in opportunity.get('investors', []) if inv.get('client_id') == investor_id), None)
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found in this opportunity")
    
    # Verify milestone exists
    payment_schedule = opportunity.get('payment_schedule', [])
    if milestone_index < 0 or milestone_index >= len(payment_schedule):
        raise HTTPException(status_code=400, detail="Invalid milestone index")
    
    # Save invoice file
    import os
    upload_dir = "/app/uploads/invoices"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = invoice_file.filename.split('.')[-1] if '.' in invoice_file.filename else 'pdf'
    invoice_filename = f"{opportunity_id}_{investor_id}_{milestone_index}_{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(upload_dir, invoice_filename)
    
    with open(file_path, "wb") as f:
        content = await invoice_file.read()
        f.write(content)
    
    # Create invoice record
    invoice_record = {
        "id": str(uuid.uuid4()),
        "milestone_index": milestone_index,
        "investor_id": investor_id,
        "investor_name": investor.get('client_name', 'Unknown'),
        "invoice_number": invoice_number or f"INV-{opportunity_id[:8]}-{milestone_index}-{investor_id[:8]}".upper(),
        "invoice_date": invoice_date or datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        "due_date": due_date or payment_schedule[milestone_index].get('date'),
        "amount": opportunity.get('unit_price', 0) * payment_schedule[milestone_index].get('percentage', 0) / 100 * (investor.get('share_percentage', 0) / 100),
        "file_url": f"/uploads/invoices/{invoice_filename}",
        "original_filename": invoice_file.filename,
        "notes": notes,
        "uploaded_by": current_user['id'],
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update opportunity with invoice
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$push": {"investor_invoices": invoice_record}}
    )
    
    return {
        "message": "Invoice uploaded successfully",
        "invoice_id": invoice_record['id'],
        "invoice_number": invoice_record['invoice_number']
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/invoices/{invoice_id}")
async def download_invoice(
    opportunity_id: str,
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download an invoice file"""
    from fastapi.responses import FileResponse
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find the invoice
    invoice = next((inv for inv in opportunity.get('investor_invoices', []) if inv.get('id') == invoice_id), None)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Check authorization
    user_role = current_user['role']
    user_id = current_user['id']
    
    if user_role == 'broker':
        if opportunity.get('created_by') != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        # Sub-broker can view invoices for their clients
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'client':
        # Client can only view their own invoices
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or invoice.get('investor_id') != client['id']:
            raise HTTPException(status_code=403, detail="Not authorized to view this invoice")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    file_path = f"/app{invoice['file_url']}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Invoice file not found")
    
    return FileResponse(
        file_path,
        filename=invoice.get('original_filename', 'invoice.pdf'),
        media_type='application/octet-stream'
    )


@api_router.delete("/real-estate-opportunities/{opportunity_id}/invoices/{invoice_id}")
async def delete_invoice(
    opportunity_id: str,
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an invoice (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete invoices")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    if opportunity.get('created_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find and remove the invoice
    invoice = next((inv for inv in opportunity.get('investor_invoices', []) if inv.get('id') == invoice_id), None)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Delete file
    file_path = f"/app{invoice['file_url']}"
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Remove from database
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$pull": {"investor_invoices": {"id": invoice_id}}}
    )
    
    return {"message": "Invoice deleted successfully"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/upload-developer-receipt")
async def upload_developer_receipt(
    opportunity_id: str,
    milestone_index: int = Form(...),
    payment_id: str = Form(...),
    receipt_number: str = Form(None),
    receipt_date: str = Form(None),
    notes: str = Form(None),
    receipt_file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a developer receipt for a recorded payment (by client or broker)"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find the payment record
    investor_payments = opportunity.get('investor_payments', [])
    payment = next((p for p in investor_payments if p.get('id') == payment_id), None)
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")
    
    # Verify authorization - client can only upload for their own payment, broker can upload for any
    if current_user['role'] == 'client':
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or payment.get('investor_id') != client.get('id'):
            raise HTTPException(status_code=403, detail="Not authorized to upload receipt for this payment")
    elif current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Save receipt file
    upload_dir = "/app/uploads/developer_receipts"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = receipt_file.filename.split('.')[-1] if '.' in receipt_file.filename else 'pdf'
    receipt_filename = f"{opportunity_id}_{payment_id}_{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(upload_dir, receipt_filename)
    
    with open(file_path, "wb") as f:
        content = await receipt_file.read()
        f.write(content)
    
    # Update the payment record with developer receipt info
    receipt_record = {
        "id": str(uuid.uuid4()),
        "receipt_number": receipt_number or f"RCP-{payment_id[:8]}".upper(),
        "receipt_date": receipt_date or datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        "file_url": f"/uploads/developer_receipts/{receipt_filename}",
        "original_filename": receipt_file.filename,
        "notes": notes,
        "uploaded_by": current_user['id'],
        "uploaded_by_name": current_user.get('name', current_user.get('pan_number')),
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update the specific payment in the array
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id, "investor_payments.id": payment_id},
        {"$set": {"investor_payments.$.developer_receipt": receipt_record}}
    )
    
    return {
        "message": "Developer receipt uploaded successfully",
        "receipt_id": receipt_record['id']
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/developer-receipt/{payment_id}")
async def download_developer_receipt(
    opportunity_id: str,
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download a developer receipt file"""
    from fastapi.responses import FileResponse
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find the payment record
    payment = next((p for p in opportunity.get('investor_payments', []) if p.get('id') == payment_id), None)
    if not payment or not payment.get('developer_receipt'):
        raise HTTPException(status_code=404, detail="Developer receipt not found")
    
    receipt = payment['developer_receipt']
    
    # Check authorization
    user_role = current_user['role']
    if user_role == 'client':
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or payment.get('investor_id') != client.get('id'):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        # Sub-broker can view receipts for their clients
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": current_user['id']}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role != 'broker':
        raise HTTPException(status_code=403, detail="Not authorized")
    
    file_path = f"/app{receipt['file_url']}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Receipt file not found")
    
    return FileResponse(
        file_path,
        filename=receipt.get('original_filename', 'developer_receipt.pdf'),
        media_type='application/octet-stream'
    )


@api_router.post("/real-estate-opportunities/{opportunity_id}/investor-payment")
async def record_investor_payment(
    opportunity_id: str,
    milestone_index: int = Form(...),
    investor_id: str = Form(...),
    transfer_date: str = Form(...),
    home_currency: str = Form("AED"),
    home_currency_amount: float = Form(0),
    aed_amount: float = Form(...),
    effective_rate: float = Form(0),
    swift_copy: UploadFile = File(None),
    current_user: dict = Depends(get_current_user)
):
    """Record a payment from an investor for a specific milestone"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can record payments")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Verify opportunity is fully funded before allowing payment recording
    if opportunity.get('status') != 'fully_invested':
        raise HTTPException(status_code=400, detail="Cannot record payments until the property is fully funded")
    
    # Handle SWIFT copy upload
    swift_url = None
    swift_filename = None
    if swift_copy:
        # Save file locally (in production, upload to cloud storage)
        import os
        upload_dir = "/app/uploads/swift"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_ext = swift_copy.filename.split('.')[-1] if '.' in swift_copy.filename else 'pdf'
        swift_filename = f"{opportunity_id}_{investor_id}_{milestone_index}_{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(upload_dir, swift_filename)
        
        with open(file_path, "wb") as f:
            content = await swift_copy.read()
            f.write(content)
        
        swift_url = f"/uploads/swift/{swift_filename}"
    
    # Create payment record
    # If broker is recording, auto-verify the payment
    is_broker_recording = current_user['role'] == 'broker' and opportunity.get('created_by') == current_user['id']
    payment_status = "verified" if is_broker_recording else "pending_verification"
    
    payment_record = {
        "id": str(uuid.uuid4()),
        "milestone_index": milestone_index,
        "investor_id": investor_id,
        "transfer_date": transfer_date,
        "home_currency": home_currency,
        "home_currency_amount": home_currency_amount,
        "aed_amount": aed_amount,
        "effective_rate": effective_rate if effective_rate else (home_currency_amount / aed_amount if aed_amount > 0 else 0),
        "swift_copy_url": swift_url,
        "swift_copy_filename": swift_filename,
        "status": payment_status,
        "recorded_by": current_user['id'],
        "recorded_by_name": current_user.get('name', current_user.get('pan_number')),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "verified_at": datetime.now(timezone.utc).isoformat() if is_broker_recording else None,
        "verified_by": current_user['id'] if is_broker_recording else None
    }
    
    # Update opportunity
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$push": {"investor_payments": payment_record}}
    )
    
    # Auto-populate currency projections if this is a new currency
    if home_currency and home_currency != "AED":
        broker_id = opportunity.get('created_by')
        if broker_id:
            # Get existing broker settings
            broker_settings = await db.broker_settings.find_one({"broker_id": broker_id}, {"_id": 0})
            existing_projections = broker_settings.get("currency_projections", []) if broker_settings else []
            
            # Check if this currency already exists in projections
            existing_currencies = set(p.get('currency') for p in existing_projections)
            
            if home_currency not in existing_currencies:
                # Add projections for this new currency (next 6 years)
                current_year = datetime.now().year
                
                # Default rates for common currencies (per 1 AED)
                default_rates = {
                    "INR": 22.5,
                    "USD": 0.27,
                    "EUR": 0.25,
                    "GBP": 0.21,
                    "SGD": 0.37,
                    "AUD": 0.42,
                    "CAD": 0.37,
                    "CHF": 0.24,
                    "JPY": 40.0
                }
                
                # Calculate actual rate from this payment
                calculated_rate = home_currency_amount / aed_amount if aed_amount > 0 else default_rates.get(home_currency, 22.5)
                
                # Create projections for new currency
                new_projections = [
                    {"year": current_year + i, "currency": home_currency, "projected_rate": round(calculated_rate, 4)}
                    for i in range(6)
                ]
                
                # Update broker settings with new currency projections
                await db.broker_settings.update_one(
                    {"broker_id": broker_id},
                    {
                        "$set": {"broker_id": broker_id, "updated_at": datetime.now(timezone.utc).isoformat()},
                        "$push": {"currency_projections": {"$each": new_projections}}
                    },
                    upsert=True
                )
    
    # Notify broker about pending payment verification (only if not already verified by broker)
    broker_id = opportunity.get('created_by')
    if broker_id and current_user['id'] != broker_id and payment_status == "pending_verification":
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": broker_id,
            "type": "payment_pending_verification",
            "title": "Payment Pending Verification",
            "message": f"A payment has been recorded for {opportunity['building_name']} - Unit {opportunity['unit_no']} and requires your verification.",
            "opportunity_id": opportunity_id,
            "payment_id": payment_record['id'],
            "recorded_by": current_user.get('name', current_user.get('pan_number')),
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    # Return appropriate message based on status
    if payment_status == "verified":
        return {
            "message": "Payment recorded and automatically verified.",
            "payment_id": payment_record['id'],
            "status": "verified"
        }
    else:
        return {
            "message": "Payment recorded successfully. Pending broker verification.",
            "payment_id": payment_record['id'],
            "status": "pending_verification"
        }


@api_router.post("/real-estate-opportunities/{opportunity_id}/oqood")
async def upload_oqood_document(
    opportunity_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload Oqood document for a real estate opportunity"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can upload Oqood documents")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Save file
    import os
    upload_dir = "/app/uploads/oqood"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    filename = f"{opportunity_id}_oqood_{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    oqood_document = {
        "filename": file.filename,
        "stored_filename": filename,
        "url": f"/uploads/oqood/{filename}",
        "uploaded_by": current_user['id'],
        "uploaded_by_name": current_user.get('name', current_user.get('pan_number')),
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"oqood_document": oqood_document}}
    )
    
    return {
        "message": "Oqood document uploaded successfully",
        "filename": filename
    }


@api_router.put("/real-estate-opportunities/{opportunity_id}/verify-payment/{payment_id}")
async def verify_investor_payment(
    opportunity_id: str,
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Verify an investor payment (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can verify payments")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find and update the payment
    payments = opportunity.get('investor_payments', [])
    payment_found = False
    milestone_index = None
    
    for i, payment in enumerate(payments):
        if payment.get('id') == payment_id:
            payments[i]['status'] = 'verified'
            payments[i]['verified_by'] = current_user['id']
            payments[i]['verified_by_name'] = current_user.get('name', current_user.get('pan_number'))
            payments[i]['verified_at'] = datetime.now(timezone.utc).isoformat()
            payment_found = True
            milestone_index = payment.get('milestone_index')
            break
    
    if not payment_found:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investor_payments": payments}}
    )
    
    # Check if all payments for this milestone are now verified
    milestone_payments = [p for p in payments if p.get('milestone_index') == milestone_index]
    verified_count = sum(1 for p in milestone_payments if p.get('status') == 'verified')
    
    if verified_count >= 4:
        # Mark milestone as completed
        payment_schedule = opportunity.get('payment_schedule', [])
        if milestone_index is not None and milestone_index < len(payment_schedule):
            payment_schedule[milestone_index]['completed'] = True
            payment_schedule[milestone_index]['completed_at'] = datetime.now(timezone.utc).isoformat()
            
            # Calculate total payment percentage completed
            total_completed = sum(p['percentage'] for p in payment_schedule if p.get('completed'))
            
            await db.real_estate_opportunities.update_one(
                {"id": opportunity_id},
                {"$set": {
                    "payment_schedule": payment_schedule,
                    "total_payment_percentage_completed": total_completed
                }}
            )
    
    return {"message": "Payment verified successfully"}


@api_router.put("/real-estate-opportunities/{opportunity_id}/approve-receipt/{payment_id}")
async def approve_developer_receipt(
    opportunity_id: str,
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve a developer receipt (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can approve receipts")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find and update the payment
    payments = opportunity.get('investor_payments', [])
    payment_found = False
    
    for i, payment in enumerate(payments):
        if payment.get('id') == payment_id:
            if not payment.get('developer_receipt'):
                raise HTTPException(status_code=400, detail="No receipt uploaded for this payment")
            payments[i]['receipt_approved'] = True
            payments[i]['receipt_approved_by'] = current_user['id']
            payments[i]['receipt_approved_by_name'] = current_user.get('name', current_user.get('pan_number'))
            payments[i]['receipt_approved_at'] = datetime.now(timezone.utc).isoformat()
            payment_found = True
            break
    
    if not payment_found:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investor_payments": payments}}
    )
    
    return {"message": "Receipt approved successfully"}


# DLD + Admin Fee Document Management
@api_router.post("/real-estate-opportunities/{opportunity_id}/dld-admin/{investor_id}/upload")
async def upload_dld_admin_document(
    opportunity_id: str,
    investor_id: str,
    document_type: str = Form(...),  # 'invoice', 'swift', 'receipt'
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload DLD + Admin fee documents (invoice, SWIFT, or receipt)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can upload DLD+Admin documents")
    
    if document_type not in ['invoice', 'swift', 'receipt']:
        raise HTTPException(status_code=400, detail="Invalid document type. Must be 'invoice', 'swift', or 'receipt'")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Verify investor exists
    investor = next((inv for inv in opportunity.get('investors', []) if inv['client_id'] == investor_id), None)
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found in this opportunity")
    
    # Save file
    os.makedirs("uploads/dld_admin", exist_ok=True)
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    filename = f"{opportunity_id}_{investor_id}_{document_type}_{datetime.now().strftime('%Y%m%d%H%M%S')}.{file_ext}"
    file_path = f"uploads/dld_admin/{filename}"
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    # Update or create DLD+Admin document record
    dld_admin_documents = opportunity.get('dld_admin_documents', [])
    
    # Find existing record for this investor
    existing_idx = next((i for i, d in enumerate(dld_admin_documents) if d.get('investor_id') == investor_id), None)
    
    if existing_idx is not None:
        # Update existing record
        dld_admin_documents[existing_idx][f'{document_type}_url'] = f"/api/{file_path}"
        dld_admin_documents[existing_idx][f'{document_type}_uploaded_at'] = datetime.now(timezone.utc).isoformat()
        dld_admin_documents[existing_idx][f'{document_type}_uploaded_by'] = current_user['id']
    else:
        # Create new record
        new_record = {
            'investor_id': investor_id,
            'investor_name': investor.get('client_name'),
            f'{document_type}_url': f"/api/{file_path}",
            f'{document_type}_uploaded_at': datetime.now(timezone.utc).isoformat(),
            f'{document_type}_uploaded_by': current_user['id']
        }
        dld_admin_documents.append(new_record)
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"dld_admin_documents": dld_admin_documents}}
    )
    
    return {"message": f"DLD+Admin {document_type} uploaded successfully", "file_url": f"/api/{file_path}"}


@api_router.put("/real-estate-opportunities/{opportunity_id}/dld-admin/{investor_id}/verify-swift")
async def verify_dld_admin_swift(
    opportunity_id: str,
    investor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Verify DLD + Admin SWIFT payment (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can verify DLD+Admin SWIFT")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    dld_admin_documents = opportunity.get('dld_admin_documents', [])
    doc_idx = next((i for i, d in enumerate(dld_admin_documents) if d.get('investor_id') == investor_id), None)
    
    if doc_idx is None:
        raise HTTPException(status_code=404, detail="DLD+Admin record not found for this investor")
    
    if not dld_admin_documents[doc_idx].get('swift_url'):
        raise HTTPException(status_code=400, detail="No SWIFT document uploaded yet")
    
    dld_admin_documents[doc_idx]['swift_verified'] = True
    dld_admin_documents[doc_idx]['swift_verified_at'] = datetime.now(timezone.utc).isoformat()
    dld_admin_documents[doc_idx]['swift_verified_by'] = current_user['id']
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"dld_admin_documents": dld_admin_documents}}
    )
    
    return {"message": "DLD+Admin SWIFT verified successfully"}


@api_router.put("/real-estate-opportunities/{opportunity_id}/dld-admin/{investor_id}/approve-receipt")
async def approve_dld_admin_receipt(
    opportunity_id: str,
    investor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve DLD + Admin receipt (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can approve DLD+Admin receipts")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    dld_admin_documents = opportunity.get('dld_admin_documents', [])
    doc_idx = next((i for i, d in enumerate(dld_admin_documents) if d.get('investor_id') == investor_id), None)
    
    if doc_idx is None:
        raise HTTPException(status_code=404, detail="DLD+Admin record not found for this investor")
    
    if not dld_admin_documents[doc_idx].get('receipt_url'):
        raise HTTPException(status_code=400, detail="No receipt document uploaded yet")
    
    dld_admin_documents[doc_idx]['receipt_approved'] = True
    dld_admin_documents[doc_idx]['receipt_approved_at'] = datetime.now(timezone.utc).isoformat()
    dld_admin_documents[doc_idx]['receipt_approved_by'] = current_user['id']
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"dld_admin_documents": dld_admin_documents}}
    )
    
    return {"message": "DLD+Admin receipt approved successfully"}


# Serve uploaded files
@api_router.get("/uploads/{folder}/{filename}")
async def serve_upload(folder: str, filename: str):
    """Serve uploaded files"""
    file_path = f"/app/uploads/{folder}/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)


@api_router.get("/client/real-estate-investments")
async def get_client_real_estate_investments(current_user: dict = Depends(get_current_user)):
    """Get real estate investments for the logged-in client"""
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record - try pan_number first, then pan for legacy users
    pan = current_user.get('pan_number') or current_user.get('pan')
    client = await db.clients.find_one({"pan_number": pan})
    if not client:
        raise HTTPException(status_code=404, detail="Client profile not found")
    
    client_id = client['id']
    
    # Find all opportunities where this client is an investor
    opportunities = await db.real_estate_opportunities.find(
        {"investors.client_id": client_id},
        {"_id": 0, "images": 0}  # Exclude large fields
    ).to_list(1000)
    
    # Format response with client-specific investment details
    result = []
    for opp in opportunities:
        # Find client's investment in this opportunity
        client_investment = next(
            (inv for inv in opp.get('investors', []) if inv['client_id'] == client_id),
            None
        )
        
        result.append({
            "id": opp['id'],
            "building_name": opp['building_name'],
            "unit_no": opp['unit_no'],
            "property_type": opp['property_type'],
            "location": opp.get('location'),
            "total_cost": opp['total_cost'],
            "unit_price": opp['unit_price'],
            "status": opp['status'],
            "payment_schedule": opp.get('payment_schedule', []),
            "total_payment_percentage_completed": opp.get('total_payment_percentage_completed', 0),
            "is_eligible_to_sell": opp.get('is_eligible_to_sell', False),
            "my_investment": client_investment,
            "expected_sale_rate": opp.get('expected_sale_rate'),
            "estimated_sell_date": opp.get('estimated_sell_date')
        })
    
    return result


# ==================== END REAL ESTATE OPPORTUNITY ====================


# ==================== CURRENCY RATE PROJECTIONS ====================

class CurrencyRateProjection(BaseModel):
    year: int
    currency: str  # INR, USD, EUR, GBP, etc.
    projected_rate: float  # Rate per 1 AED (e.g., 22.5 INR = 1 AED)

class DldProjection(BaseModel):
    year: int
    dld_percentage: float  # DLD percentage (typically 4%)

class AdminFeeProjection(BaseModel):
    year: int
    admin_fee_percentage: float  # Admin fee percentage

class CurrencyRateProjectionsUpdate(BaseModel):
    projections: List[CurrencyRateProjection]
    dld_projections: Optional[List[DldProjection]] = None
    admin_projections: Optional[List[AdminFeeProjection]] = None

@api_router.get("/settings/currency-projections")
async def get_currency_projections(current_user: dict = Depends(get_current_user)):
    """Get projected currency rates, DLD and admin fee for XIRR calculations"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access settings")
    
    broker_id = current_user['id']
    current_year = datetime.now().year
    
    settings = await db.broker_settings.find_one({"broker_id": broker_id}, {"_id": 0})
    if not settings:
        # Return default projections for current and next 5 years
        default_projections = [
            {"year": current_year + i, "currency": "INR", "projected_rate": 22.5}
            for i in range(6)
        ]
        default_dld = [
            {"year": current_year + i, "dld_percentage": 4.0}
            for i in range(6)
        ]
        default_admin = [
            {"year": current_year + i, "admin_fee_percentage": 2.0}
            for i in range(6)
        ]
        return {
            "projections": default_projections,
            "dld_projections": default_dld,
            "admin_projections": default_admin
        }
    
    return {
        "projections": settings.get("currency_projections", []),
        "dld_projections": settings.get("dld_projections", []),
        "admin_projections": settings.get("admin_projections", [])
    }

@api_router.put("/settings/currency-projections")
async def update_currency_projections(
    data: CurrencyRateProjectionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update projected currency rates, DLD and admin fee"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update settings")
    
    broker_id = current_user['id']
    
    update_data = {
        "broker_id": broker_id,
        "currency_projections": [p.dict() for p in data.projections],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add DLD projections if provided
    if data.dld_projections:
        update_data["dld_projections"] = [p.dict() for p in data.dld_projections]
    
    # Add Admin projections if provided
    if data.admin_projections:
        update_data["admin_projections"] = [p.dict() for p in data.admin_projections]
    
    # Upsert the settings
    await db.broker_settings.update_one(
        {"broker_id": broker_id},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Projections updated successfully"}


@api_router.get("/real-estate-opportunities/{opportunity_id}/xirr-comparison/{investor_id}")
async def get_xirr_comparison_report(
    opportunity_id: str,
    investor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate XIRR comparison report for an investor showing projected vs actual rates"""
    
    # Get the opportunity
    opp = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    # Get the investor
    investor = next((inv for inv in opp.get('investors', []) if inv.get('client_id') == investor_id), None)
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found in this opportunity")
    
    # Get broker's projected rates
    broker_id = opp.get('created_by')
    settings = await db.broker_settings.find_one({"broker_id": broker_id}, {"_id": 0})
    projected_rates = {p['year']: p for p in settings.get('currency_projections', [])} if settings else {}
    
    # Get client info
    client = await db.clients.find_one({"id": investor_id}, {"_id": 0, "name": 1, "preferred_currency": 1})
    client_currency = client.get('preferred_currency', 'INR') if client else 'INR'
    
    # Get investor's share percentage
    share_percentage = investor.get('share_percentage', 25)
    
    # Calculate investor's portion of total cost
    total_cost = opp.get('total_cost', 0)
    unit_price = opp.get('unit_price', 0)
    investor_total_cost = total_cost * share_percentage / 100
    investor_unit_price = unit_price * share_percentage / 100
    
    # Get payment schedule and actual payments
    payment_schedule = opp.get('payment_schedule', [])
    investor_payments = opp.get('investor_payments', [])
    investor_actual_payments = [p for p in investor_payments if p.get('investor_id') == investor_id]
    
    # Build cashflow comparison
    cashflows_projected = []
    cashflows_actual = []
    total_projected_home_currency = 0
    total_actual_home_currency = 0
    total_aed_amount = 0
    
    for idx, milestone in enumerate(payment_schedule):
        milestone_date = milestone.get('date', '')
        milestone_percentage = milestone.get('percentage', 0)
        milestone_aed = investor_unit_price * milestone_percentage / 100
        
        # Get year for projected rate lookup
        try:
            year = int(milestone_date[:4]) if milestone_date else datetime.now().year
        except:
            year = datetime.now().year
        
        # Get projected rate for this year
        projected_rate_info = projected_rates.get(year, {})
        projected_rate = projected_rate_info.get('projected_rate', 22.5) if projected_rate_info else 22.5
        
        # Calculate projected home currency amount
        projected_home_currency = milestone_aed * projected_rate
        total_projected_home_currency += projected_home_currency
        total_aed_amount += milestone_aed
        
        # Find actual payment for this milestone
        actual_payment = next((p for p in investor_actual_payments if p.get('milestone_index') == idx), None)
        
        if actual_payment:
            # Get values directly from payment record (not nested in payment_details)
            actual_home_currency = float(actual_payment.get('home_currency_amount', 0) or 0)
            actual_aed = float(actual_payment.get('aed_amount', 0) or 0)
            # Use effective_rate if available, otherwise calculate from amounts
            if actual_payment.get('effective_rate'):
                actual_rate = float(actual_payment.get('effective_rate', 0))
            elif actual_home_currency > 0 and actual_aed > 0:
                actual_rate = actual_home_currency / actual_aed
            else:
                actual_rate = projected_rate
        else:
            # Use projected values if no actual payment yet
            actual_home_currency = projected_home_currency
            actual_aed = milestone_aed
            actual_rate = projected_rate
        
        total_actual_home_currency += actual_home_currency
        
        cashflows_projected.append({
            "date": milestone_date,
            "description": milestone.get('description', f'Milestone {idx + 1}'),
            "percentage": milestone_percentage,
            "aed_amount": milestone_aed,
            "projected_rate": projected_rate,
            "home_currency_amount": projected_home_currency,
            "type": "outflow"
        })
        
        cashflows_actual.append({
            "date": milestone_date,
            "description": milestone.get('description', f'Milestone {idx + 1}'),
            "percentage": milestone_percentage,
            "aed_amount": actual_aed,
            "actual_rate": actual_rate,
            "home_currency_amount": actual_home_currency,
            "type": "outflow",
            "is_paid": actual_payment is not None
        })
    
    # Add DLD Fee as a line item (calculated from dld_fee or dld_fee_percentage)
    dld_fee = opp.get('dld_fee', 0)
    if not dld_fee and opp.get('dld_fee_percentage'):
        dld_fee = unit_price * float(opp.get('dld_fee_percentage', 4)) / 100
    investor_dld_fee = dld_fee * share_percentage / 100 if dld_fee else 0
    
    # Always show DLD if percentage exists (even if 0 value currently)
    dld_percentage = opp.get('dld_fee_percentage', 4)
    if investor_dld_fee > 0 or dld_percentage:
        if investor_dld_fee == 0:
            investor_dld_fee = investor_unit_price * float(dld_percentage) / 100
        
        # Use first milestone date for DLD (usually paid with booking)
        dld_date = payment_schedule[0].get('date', '') if payment_schedule else ''
        try:
            dld_year = int(dld_date[:4]) if dld_date else datetime.now().year
        except:
            dld_year = datetime.now().year
        
        dld_projected_rate = projected_rates.get(dld_year, {}).get('projected_rate', 22.5)
        dld_projected_home = investor_dld_fee * dld_projected_rate
        
        total_projected_home_currency += dld_projected_home
        total_aed_amount += investor_dld_fee
        
        # Check if DLD was paid (look for DLD payment in investor payments)
        dld_payment = next((p for p in investor_actual_payments if 'dld' in p.get('description', '').lower()), None)
        
        if dld_payment:
            actual_dld_home = float(dld_payment.get('home_currency_amount', 0) or 0)
            actual_dld_aed = float(dld_payment.get('aed_amount', 0) or 0)
            actual_dld_rate = actual_dld_home / actual_dld_aed if actual_dld_aed > 0 else dld_projected_rate
        else:
            actual_dld_home = dld_projected_home
            actual_dld_aed = investor_dld_fee
            actual_dld_rate = dld_projected_rate
        
        total_actual_home_currency += actual_dld_home
        
        cashflows_projected.append({
            "date": dld_date,
            "description": f"DLD Fee ({dld_percentage}%)",
            "percentage": dld_percentage,
            "aed_amount": investor_dld_fee,
            "projected_rate": dld_projected_rate,
            "home_currency_amount": dld_projected_home,
            "type": "outflow"
        })
        
        cashflows_actual.append({
            "date": dld_date,
            "description": f"DLD Fee ({dld_percentage}%)",
            "percentage": dld_percentage,
            "aed_amount": actual_dld_aed,
            "actual_rate": actual_dld_rate,
            "home_currency_amount": actual_dld_home,
            "type": "outflow",
            "is_paid": dld_payment is not None
        })
    
    # Add Admin Fee as a line item
    admin_fee = opp.get('admin_fee', 0)
    investor_admin_fee = float(admin_fee) * share_percentage / 100 if admin_fee else 0
    
    if investor_admin_fee > 0:
        # Use first milestone date for Admin (usually paid with booking)
        admin_date = payment_schedule[0].get('date', '') if payment_schedule else ''
        try:
            admin_year = int(admin_date[:4]) if admin_date else datetime.now().year
        except:
            admin_year = datetime.now().year
        
        admin_projected_rate = projected_rates.get(admin_year, {}).get('projected_rate', 22.5)
        admin_projected_home = investor_admin_fee * admin_projected_rate
        
        total_projected_home_currency += admin_projected_home
        total_aed_amount += investor_admin_fee
        
        # Check if Admin was paid
        admin_payment = next((p for p in investor_actual_payments if 'admin' in p.get('description', '').lower()), None)
        
        if admin_payment:
            actual_admin_home = float(admin_payment.get('home_currency_amount', 0) or 0)
            actual_admin_aed = float(admin_payment.get('aed_amount', 0) or 0)
            actual_admin_rate = actual_admin_home / actual_admin_aed if actual_admin_aed > 0 else admin_projected_rate
        else:
            actual_admin_home = admin_projected_home
            actual_admin_aed = investor_admin_fee
            actual_admin_rate = admin_projected_rate
        
        total_actual_home_currency += actual_admin_home
        
        cashflows_projected.append({
            "date": admin_date,
            "description": "Admin Fee",
            "aed_amount": investor_admin_fee,
            "projected_rate": admin_projected_rate,
            "home_currency_amount": admin_projected_home,
            "type": "outflow"
        })
        
        cashflows_actual.append({
            "date": admin_date,
            "description": "Admin Fee",
            "aed_amount": actual_admin_aed,
            "actual_rate": actual_admin_rate,
            "home_currency_amount": actual_admin_home,
            "type": "outflow",
            "is_paid": admin_payment is not None
        })
    
    # Calculate sale proceeds (inflow)
    sell_date = opp.get('estimated_sell_date', '')
    expected_sale_rate = opp.get('expected_sale_rate', 0)  # per sqft
    total_area = opp.get('total_area', 0)
    selling_fee_percentage = opp.get('selling_fee_percentage', 0)
    
    if sell_date and expected_sale_rate and total_area:
        gross_sale = expected_sale_rate * total_area
        selling_fee = gross_sale * selling_fee_percentage / 100
        
        # Calculate outstanding amount (unpaid portion of unit price)
        paid_percentage = sum(m.get('percentage', 0) for m in payment_schedule if any(
            p.get('milestone_index') == i and p.get('status') == 'verified' 
            for i, p in enumerate(investor_actual_payments)
        ))
        outstanding_percentage = 100 - paid_percentage
        outstanding_amount = investor_unit_price * outstanding_percentage / 100
        
        net_sale = gross_sale - selling_fee - outstanding_amount
        investor_net_sale = net_sale * share_percentage / 100
        
        # Get projected rate for sale year
        try:
            sale_year = int(sell_date[:4])
        except:
            sale_year = datetime.now().year + 2
        
        sale_projected_rate = projected_rates.get(sale_year, {}).get('projected_rate', 22.5)
        
        # Add sale inflow
        cashflows_projected.append({
            "date": sell_date,
            "description": "Expected Sale Proceeds",
            "aed_amount": investor_net_sale,
            "projected_rate": sale_projected_rate,
            "home_currency_amount": investor_net_sale * sale_projected_rate,
            "type": "inflow"
        })
        
        cashflows_actual.append({
            "date": sell_date,
            "description": "Expected Sale Proceeds",
            "aed_amount": investor_net_sale,
            "actual_rate": sale_projected_rate,  # Use projected for future sale
            "home_currency_amount": investor_net_sale * sale_projected_rate,
            "type": "inflow",
            "is_paid": False
        })
    
    # Calculate XIRR for both scenarios
    def calculate_xirr_from_cashflows(cashflows):
        """Calculate XIRR from cashflow list"""
        try:
            from scipy.optimize import brentq
            
            cf_data = []
            for cf in cashflows:
                date_str = cf.get('date', '')
                if not date_str:
                    continue
                try:
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                except:
                    try:
                        dt = datetime.strptime(date_str, '%Y-%m-%d')
                    except:
                        continue
                
                amount = cf.get('home_currency_amount', 0)
                if cf.get('type') == 'outflow':
                    amount = -abs(amount)
                else:
                    amount = abs(amount)
                
                cf_data.append((dt, amount))
            
            if len(cf_data) < 2:
                return None
            
            # Sort by date
            cf_data.sort(key=lambda x: x[0])
            
            dates = [cf[0] for cf in cf_data]
            amounts = [cf[1] for cf in cf_data]
            
            # Check if we have both positive and negative cashflows
            if not (any(a > 0 for a in amounts) and any(a < 0 for a in amounts)):
                return None
            
            def xnpv(rate, dates, amounts):
                first_date = dates[0]
                return sum(
                    amount / ((1 + rate) ** ((date - first_date).days / 365.0))
                    for date, amount in zip(dates, amounts)
                )
            
            try:
                xirr = brentq(lambda r: xnpv(r, dates, amounts), -0.999, 10, maxiter=1000)
                return round(xirr * 100, 2)
            except:
                return None
        except Exception as e:
            print(f"XIRR calculation error: {e}")
            return None
    
    xirr_projected = calculate_xirr_from_cashflows(cashflows_projected)
    xirr_actual = calculate_xirr_from_cashflows(cashflows_actual)
    
    # Calculate currency gain/loss
    currency_gain_loss = total_projected_home_currency - total_actual_home_currency
    currency_gain_loss_percentage = (currency_gain_loss / total_projected_home_currency * 100) if total_projected_home_currency > 0 else 0
    
    return {
        "opportunity": {
            "id": opportunity_id,
            "building_name": opp.get('building_name', ''),
            "unit_number": opp.get('unit_number', ''),
            "estimated_sell_date": sell_date,
            "expected_sale_rate": expected_sale_rate
        },
        "investor": {
            "id": investor_id,
            "name": client.get('name', 'Unknown') if client else 'Unknown',
            "share_percentage": share_percentage,
            "currency": client_currency
        },
        "summary": {
            "total_investment_aed": total_aed_amount,
            "total_projected_home_currency": round(total_projected_home_currency, 2),
            "total_actual_home_currency": round(total_actual_home_currency, 2),
            "currency_gain_loss": round(currency_gain_loss, 2),
            "currency_gain_loss_percentage": round(currency_gain_loss_percentage, 2),
            "xirr_projected": xirr_projected,
            "xirr_actual": xirr_actual,
            "xirr_difference": round((xirr_actual or 0) - (xirr_projected or 0), 2) if xirr_projected and xirr_actual else None
        },
        "cashflows_projected": cashflows_projected,
        "cashflows_actual": cashflows_actual
    }


# ==================== EMAIL SHARING ENDPOINTS ====================

class EmailShareRequest(BaseModel):
    client_ids: List[str]
    personal_message: Optional[str] = None
    include_photos: Optional[bool] = True

@api_router.post("/bonds/{bond_id}/share-email")
async def share_bond_via_email(
    bond_id: str, 
    request: EmailShareRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Share bond opportunity with clients via email"""
    
    # Get the bond
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Get sender info
    sender_name = current_user.get('name', 'Kinntegraa')
    
    # Get clients
    clients_sent = []
    clients_failed = []
    
    for client_id in request.client_ids:
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            clients_failed.append({"id": client_id, "reason": "Client not found"})
            continue
        
        if not client.get('email'):
            clients_failed.append({"id": client_id, "name": client.get('name'), "reason": "No email address"})
            continue
        
        # Send email in background
        background_tasks.add_task(
            send_bond_opportunity_email,
            recipient_email=client['email'],
            recipient_name=client.get('name', 'Investor'),
            bond_details=bond,
            sender_name=sender_name,
            personal_message=request.personal_message
        )
        clients_sent.append({"id": client_id, "name": client.get('name'), "email": client['email']})
    
    return {
        "message": f"Emails queued for {len(clients_sent)} clients",
        "sent_to": clients_sent,
        "failed": clients_failed
    }


@api_router.post("/real-estate-opportunities/{opportunity_id}/share-email")
async def share_real_estate_via_email(
    opportunity_id: str, 
    request: EmailShareRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Share real estate opportunity with clients via email"""
    
    # Get the property
    opp = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Get sender info
    sender_name = current_user.get('name', 'Kinntegraa')
    
    # Get clients
    clients_sent = []
    clients_failed = []
    
    for client_id in request.client_ids:
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            clients_failed.append({"id": client_id, "reason": "Client not found"})
            continue
        
        if not client.get('email'):
            clients_failed.append({"id": client_id, "name": client.get('name'), "reason": "No email address"})
            continue
        
        # Send email in background
        background_tasks.add_task(
            send_real_estate_opportunity_email,
            recipient_email=client['email'],
            recipient_name=client.get('name', 'Investor'),
            property_details=opp,
            sender_name=sender_name,
            personal_message=request.personal_message,
            include_photos=request.include_photos
        )
        clients_sent.append({"id": client_id, "name": client.get('name'), "email": client['email']})
    
    return {
        "message": f"Emails queued for {len(clients_sent)} clients",
        "sent_to": clients_sent,
        "failed": clients_failed
    }


@api_router.post("/email/test")
async def test_email(current_user: dict = Depends(get_current_user)):
    """Test email configuration by sending a test email to the current user"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can test email")
    
    # Get user's email
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    if not user or not user.get('email'):
        raise HTTPException(status_code=400, detail="No email address found for your account")
    
    from email_service import send_email
    
    success = send_email(
        to_email=user['email'],
        subject="Kinntegraa - Test Email",
        html_content=f"""
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h1 style="color: #4F46E5;">✅ Email Configuration Working!</h1>
            <p>Hello {current_user.get('name', 'User')},</p>
            <p>This is a test email from your Kinntegraa system. If you received this, your email configuration is working correctly.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">&copy; 2025 Kinntegraa. All rights reserved.</p>
        </div>
        """
    )
    
    if success:
        return {"message": f"Test email sent successfully to {user['email']}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send test email. Check server logs.")


# ==================== EMAIL READER ENDPOINTS ====================

@api_router.get("/email-reader/test-connection")
async def test_email_reader_connection(current_user: dict = Depends(get_current_user)):
    """Test connection to the repayment email inbox"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this")
    
    result = test_email_connection()
    return result


@api_router.post("/email-reader/process")
async def process_emails_endpoint(
    days_back: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually trigger email processing to fetch and process repayment emails
    Updates cashflows with actual repayment data from emails
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can process emails")
    
    result = await process_repayment_emails(db, days_back)
    return result


@api_router.get("/email-reader/preview")
async def preview_repayment_emails(
    days_back: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Preview repayment emails without processing them"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this")
    
    reader = RepaymentEmailReader()
    try:
        if not reader.connect():
            raise HTTPException(status_code=500, detail="Failed to connect to email server")
        
        emails = reader.fetch_repayment_emails(days_back)
        return {
            "total_emails": len(emails),
            "emails": emails
        }
    finally:
        reader.disconnect()


@api_router.get("/email-reader/logs")
async def get_email_processing_logs(
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get email processing logs"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this")
    
    logs = await db.email_processing_logs.find(
        {}, {"_id": 0}
    ).sort("processed_at", -1).limit(limit).to_list(limit)
    
    return {"logs": logs}


@api_router.get("/email-reader/list-all")
async def list_all_inbox_emails(
    days_back: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Debug endpoint to list all emails in inbox"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this")
    
    emails = list_all_emails(days_back)
    return {
        "total_emails": len(emails),
        "emails": emails
    }


# ==================== SCHEDULED EMAIL PROCESSING ====================

async def scheduled_email_processing():
    """Background task to process emails daily at 9 PM"""
    try:
        logger.info("Running scheduled email processing...")
        result = await process_repayment_emails(db, days_back=1)
        logger.info(f"Scheduled email processing completed: {result}")
    except Exception as e:
        logger.error(f"Scheduled email processing failed: {e}")


# ==================== END EMAIL READER ENDPOINTS ====================


# Sell Unit Model
class SellUnitRequest(BaseModel):
    sale_date: str
    sale_price: float
    brokerage_fee: Optional[float] = 0
    selling_fee_percentage: Optional[float] = 0
    net_proceeds: Optional[float] = 0
    total_invested: Optional[float] = 0
    net_profit: Optional[float] = 0
    xirr: Optional[float] = 0
    notes: Optional[str] = ""

@api_router.post("/real-estate-opportunities/{opportunity_id}/sell")
async def sell_real_estate_unit(
    opportunity_id: str,
    data: SellUnitRequest,
    current_user: dict = Depends(get_current_user)
):
    """Sell a fully funded real estate unit and mark it as closed"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can sell units")
    
    # Get the opportunity
    opp = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Verify it's fully invested
    if opp.get('status') != 'fully_invested':
        raise HTTPException(status_code=400, detail="Only fully invested properties can be sold")
    
    # Calculate profit/loss from purchase price (basic calculation)
    purchase_price = opp.get('unit_price', 0)
    dld_fee = opp.get('dld_fee', 0)
    admin_fee = opp.get('admin_fee', 0)
    total_cost = purchase_price + dld_fee + admin_fee
    
    # Use the values from frontend if provided, otherwise calculate
    total_invested = data.total_invested if data.total_invested > 0 else total_cost
    net_profit = data.net_profit if data.net_profit != 0 else (data.net_proceeds - total_invested)
    profit_percentage = (net_profit / total_invested * 100) if total_invested > 0 else 0
    
    # Update the opportunity with comprehensive sale details
    sale_record = {
        "sale_date": data.sale_date,
        "sale_price": data.sale_price,
        "brokerage_fee": data.brokerage_fee,
        "selling_fee_percentage": data.selling_fee_percentage,
        "net_proceeds": data.net_proceeds or (data.sale_price - data.brokerage_fee),
        "total_invested": total_invested,
        "net_profit": net_profit,
        "profit_percentage": round(profit_percentage, 2),
        "xirr": round(data.xirr, 2) if data.xirr else 0,
        "notes": data.notes,
        "sold_by": current_user['id'],
        "sold_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {
            "$set": {
                "status": "closed",
                "sale_record": sale_record,
                "closed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": "Unit sold successfully",
        "sale_record": sale_record
    }


# ==================== DASHBOARD ANALYTICS ENDPOINTS ====================

@api_router.get("/dashboard/summary")
async def get_dashboard_summary(current_user: dict = Depends(get_current_user)):
    """Get summary statistics for broker dashboard"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    
    # Get clients
    clients = await db.clients.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    total_clients = len(clients)
    
    # Check user accounts for login status
    client_pans = [c.get('pan_number') for c in clients if c.get('pan_number')]
    user_accounts = await db.users.find({"pan": {"$in": client_pans}}, {"_id": 0, "pan": 1, "is_active": 1, "last_login": 1}).to_list(1000)
    
    # Create a map of PAN to user account status
    user_status_map = {u['pan']: u for u in user_accounts}
    
    # Count active (logged in / activated) vs pending (never logged in / not activated)
    active_clients = 0
    pending_clients = 0
    
    # Count clients by product type for Venn diagram
    bond_only_clients = 0
    real_estate_only_clients = 0
    both_products_clients = 0
    
    for c in clients:
        pan = c.get('pan_number')
        user_account = user_status_map.get(pan)
        
        # Client is active if:
        # 1. Has a user account AND is_active is True AND (has logged in OR not deactivated)
        if user_account and user_account.get('is_active', False):
            active_clients += 1
        else:
            pending_clients += 1
        
        # Count by opportunities for Venn diagram
        opportunities = c.get('opportunities', [])
        has_bonds = 'bonds' in opportunities
        has_real_estate = 'real_estate' in opportunities
        
        if has_bonds and has_real_estate:
            both_products_clients += 1
        elif has_bonds:
            bond_only_clients += 1
        elif has_real_estate:
            real_estate_only_clients += 1
    
    # Get sub-brokers (partners)
    partners = await db.partners.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    total_subbrokers = len(partners)
    active_subbrokers = len([p for p in partners if p.get('is_active', True)])
    
    # Get bonds
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    total_bonds = len(bonds)
    available_bonds = len([b for b in bonds if b.get('status') == 'available'])
    funded_bonds = len([b for b in bonds if b.get('status') == 'funded'])
    closed_bonds = len([b for b in bonds if b.get('status') == 'closed'])
    
    # Get real estate opportunities
    real_estate = await db.real_estate_opportunities.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    total_real_estate = len(real_estate)
    available_re = len([r for r in real_estate if r.get('status') == 'available'])
    invested_re = len([r for r in real_estate if r.get('status') in ['partially_invested', 'fully_invested']])
    
    # Calculate Bond AUM Details
    # Get all client allocations for detailed AUM breakdown
    bond_total_invested = 0
    bond_total_repaid = 0
    bond_total_pending = 0
    bond_profits = 0
    
    for client in clients:
        allocations = client.get('bond_allocations', [])
        for alloc in allocations:
            invested = alloc.get('total_investment', 0) or alloc.get('invested_amount', 0) or 0
            repaid = alloc.get('total_repaid', 0) or 0
            
            bond_total_invested += invested
            bond_total_repaid += repaid
            bond_total_pending += max(0, invested - repaid)
    
    # Calculate profits from holding cashflows
    cashflows = await db.holding_cashflows.find({}, {"_id": 0}).to_list(10000)
    for cf in cashflows:
        if cf.get('interest', 0) > 0:
            bond_profits += cf.get('interest', 0)
    
    # Legacy bond AUM calculation
    bond_aum = sum(
        (b.get('units_sold', 0) * b.get('face_value', 0)) 
        for b in bonds
    )
    
    # Calculate Real Estate AUM Details
    # Total deal size = sum of total_cost (which includes DLD and admin)
    re_total_deal_size = sum(r.get('total_cost', 0) for r in real_estate)
    
    # Total paid by clients = sum of all investments
    re_total_paid = 0
    for re_opp in real_estate:
        # Check investors list
        investors = re_opp.get('investors', [])
        for inv in investors:
            re_total_paid += inv.get('amount_paid', 0) or inv.get('invested_amount', 0) or 0
        
        # Also check invested_percentage as fallback
        if not investors and re_opp.get('invested_percentage', 0) > 0:
            re_total_paid += (re_opp.get('total_cost', 0) * re_opp.get('invested_percentage', 0) / 100)
    
    # Legacy real estate AUM calculation  
    real_estate_aum = sum(
        (r.get('total_cost', 0) * r.get('invested_percentage', 0) / 100)
        for r in real_estate
    )
    
    total_aum = bond_aum + real_estate_aum
    
    # Get trades for revenue calculation
    trades = await db.trades.find({"status": "approved"}, {"_id": 0}).to_list(10000)
    
    return {
        "clients": {
            "total": total_clients,
            "active": active_clients,
            "pending": pending_clients,
            "bond_only": bond_only_clients,
            "real_estate_only": real_estate_only_clients,
            "both_products": both_products_clients
        },
        "sub_brokers": {
            "total": total_subbrokers,
            "active": active_subbrokers
        },
        "opportunities": {
            "bonds": {
                "total": total_bonds,
                "available": available_bonds,
                "funded": funded_bonds,
                "closed": closed_bonds
            },
            "real_estate": {
                "total": total_real_estate,
                "available": available_re,
                "invested": invested_re
            }
        },
        "aum": {
            "total": total_aum,
            "bonds": bond_aum,
            "real_estate": real_estate_aum
        },
        "bond_aum": {
            "total_invested": bond_total_invested or bond_aum,
            "total_repaid": bond_total_repaid,
            "total_pending": bond_total_pending or bond_aum,
            "profits": bond_profits
        },
        "real_estate_aum": {
            "total_deal_size": re_total_deal_size,
            "total_paid": re_total_paid or real_estate_aum
        },
        "trades_count": len(trades)
    }


@api_router.get("/dashboard/clients-by-city")
async def get_clients_by_city(current_user: dict = Depends(get_current_user)):
    """Get client distribution by city"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    clients = await db.clients.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    
    city_counts = {}
    for client in clients:
        city = client.get('city', 'Unknown') or 'Unknown'
        city_counts[city] = city_counts.get(city, 0) + 1
    
    # Sort by count descending and return top 10
    sorted_cities = sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return [{"city": city, "count": count} for city, count in sorted_cities]


@api_router.get("/lookup/pincode/{pincode}")
async def lookup_pincode(pincode: str):
    """Lookup city, state, and country from Indian pincode using postal API"""
    import httpx
    
    if not pincode or len(pincode) != 6 or not pincode.isdigit():
        raise HTTPException(status_code=400, detail="Invalid pincode. Must be 6 digits.")
    
    try:
        # Use India Post API for pincode lookup
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"https://api.postalpincode.in/pincode/{pincode}")
            
            if response.status_code == 200:
                data = response.json()
                
                if data and len(data) > 0 and data[0].get('Status') == 'Success':
                    post_offices = data[0].get('PostOffice', [])
                    
                    if post_offices and len(post_offices) > 0:
                        # Get the first post office for this pincode
                        po = post_offices[0]
                        return {
                            "success": True,
                            "pincode": pincode,
                            "city": po.get('District', ''),
                            "state": po.get('State', ''),
                            "country": "India",
                            "district": po.get('District', ''),
                            "region": po.get('Region', ''),
                            "division": po.get('Division', ''),
                            "post_offices": [
                                {
                                    "name": p.get('Name', ''),
                                    "branch_type": p.get('BranchType', ''),
                                    "delivery_status": p.get('DeliveryStatus', '')
                                }
                                for p in post_offices[:5]  # Return up to 5 post offices
                            ]
                        }
                
                # No data found for this pincode
                return {
                    "success": False,
                    "pincode": pincode,
                    "message": "No data found for this pincode"
                }
            else:
                raise HTTPException(status_code=502, detail="Failed to fetch pincode data")
                
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Pincode lookup timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error looking up pincode: {str(e)}")


@api_router.get("/dashboard/aum-distribution")
async def get_aum_distribution(current_user: dict = Depends(get_current_user)):
    """Get AUM distribution by asset class and sub-broker"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    
    # Get all bonds
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    bond_aum = sum((b.get('units_sold', 0) * b.get('face_value', 0)) for b in bonds)
    
    # Get real estate opportunities
    real_estate = await db.real_estate_opportunities.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    real_estate_aum = sum((r.get('total_cost', 0) * r.get('invested_percentage', 0) / 100) for r in real_estate)
    
    # Get sub-brokers with their linked clients and calculate their AUM
    partners = await db.partners.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    subbroker_aum = []
    
    for partner in partners:
        partner_id = partner.get('id')
        # Get clients linked to this sub-broker
        linked_clients = await db.clients.find({"linked_subbroker_id": partner_id}, {"_id": 0}).to_list(1000)
        
        # Calculate AUM from bond allocations
        sb_bond_aum = 0
        for client in linked_clients:
            allocations = client.get('bond_allocations', [])
            for alloc in allocations:
                bond = next((b for b in bonds if b.get('id') == alloc.get('bond_id')), None)
                if bond:
                    sb_bond_aum += alloc.get('units_paid', 0) * bond.get('face_value', 0)
        
        # Calculate AUM from real estate investments
        sb_re_aum = 0
        for re in real_estate:
            investors = re.get('investors', [])
            for inv in investors:
                if inv.get('client_id') in [c.get('id') for c in linked_clients]:
                    sb_re_aum += re.get('total_cost', 0) * inv.get('percentage', 0) / 100
        
        subbroker_aum.append({
            "name": partner.get('name', 'Unknown'),
            "partner_code": partner.get('partner_code', ''),
            "aum": sb_bond_aum + sb_re_aum,
            "bond_aum": sb_bond_aum,
            "real_estate_aum": sb_re_aum,
            "client_count": len(linked_clients)
        })
    
    # Sort by AUM descending
    subbroker_aum.sort(key=lambda x: x['aum'], reverse=True)
    
    return {
        "by_asset_class": [
            {"name": "NCD Bonds", "value": bond_aum},
            {"name": "Real Estate", "value": real_estate_aum}
        ],
        "by_subbroker": subbroker_aum[:10]  # Top 10 sub-brokers
    }


@api_router.get("/dashboard/activity-log")
async def get_activity_log(limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Get recent activity log for the broker"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    activities = []
    
    # Get recent trades
    trades = await db.trades.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    for trade in trades:
        client = await db.clients.find_one({"id": trade.get('client_id')}, {"_id": 0, "name": 1})
        bond = await db.bonds.find_one({"id": trade.get('bond_id')}, {"_id": 0, "issuer": 1, "face_value": 1})
        
        activities.append({
            "type": "trade",
            "status": trade.get('status'),
            "description": f"Trade: {client.get('name', 'Unknown')} - {bond.get('issuer', 'Unknown')} ({trade.get('units', 0)} units)",
            "amount": trade.get('units', 0) * (bond.get('face_value', 0) if bond else 0),
            "timestamp": trade.get('created_at'),
            "client_name": client.get('name', 'Unknown') if client else 'Unknown'
        })
    
    # Get recent real estate investments
    real_estate = await db.real_estate_opportunities.find(
        {"created_by": broker_id},
        {"_id": 0}
    ).to_list(100)
    
    for re in real_estate:
        investors = re.get('investors', [])
        property_name = re.get('building_name', re.get('property_name', 'Unknown'))
        for inv in investors:
            client = await db.clients.find_one({"id": inv.get('client_id')}, {"_id": 0, "name": 1})
            activities.append({
                "type": "real_estate_investment",
                "status": "invested",
                "description": f"RE Investment: {client.get('name', 'Unknown') if client else 'Unknown'} - {property_name} ({inv.get('share_percentage', inv.get('percentage', 0))}%)",
                "amount": re.get('total_cost', 0) * inv.get('share_percentage', inv.get('percentage', 0)) / 100,
                "timestamp": inv.get('invested_at'),
                "client_name": client.get('name', 'Unknown') if client else 'Unknown',
                "property_name": property_name
            })
    
    # Get recent client creations
    clients = await db.clients.find(
        {"created_by": broker_id},
        {"_id": 0, "name": 1, "created_at": 1, "city": 1}
    ).sort("created_at", -1).to_list(limit)
    
    for client in clients:
        activities.append({
            "type": "client_created",
            "status": "new",
            "description": f"New Client: {client.get('name', 'Unknown')} ({client.get('city', 'Unknown')})",
            "amount": 0,
            "timestamp": client.get('created_at'),
            "client_name": client.get('name', 'Unknown')
        })
    
    # Sort all activities by timestamp descending
    activities.sort(key=lambda x: x.get('timestamp', '') or '', reverse=True)
    
    return activities[:limit]


@api_router.get("/dashboard/monthly-stats")
async def get_monthly_stats(year: int = None, current_user: dict = Depends(get_current_user)):
    """Get monthly statistics for the console chart"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    from datetime import datetime
    
    if year is None:
        year = datetime.now().year
    
    broker_id = current_user['id']
    
    # Initialize monthly data
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    monthly_data = {m: {"investments": 0, "trades": 0, "clients": 0} for m in months}
    
    # Get trades by month
    trades = await db.trades.find({"status": "approved"}, {"_id": 0}).to_list(10000)
    for trade in trades:
        created_at = trade.get('created_at')
        if created_at:
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    dt = created_at
                if dt.year == year:
                    month_name = months[dt.month - 1]
                    bond = await db.bonds.find_one({"id": trade.get('bond_id')}, {"_id": 0, "face_value": 1})
                    monthly_data[month_name]["trades"] += trade.get('units', 0) * (bond.get('face_value', 0) if bond else 0)
            except:
                pass
    
    # Get real estate investments by month
    real_estate = await db.real_estate_opportunities.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    for re in real_estate:
        investors = re.get('investors', [])
        for inv in investors:
            invested_at = inv.get('invested_at')
            if invested_at:
                try:
                    if isinstance(invested_at, str):
                        dt = datetime.fromisoformat(invested_at.replace('Z', '+00:00'))
                    else:
                        dt = invested_at
                    if dt.year == year:
                        month_name = months[dt.month - 1]
                        monthly_data[month_name]["investments"] += re.get('total_cost', 0) * inv.get('percentage', 0) / 100
                except:
                    pass
    
    # Get new clients by month
    clients = await db.clients.find({"created_by": broker_id}, {"_id": 0, "created_at": 1}).to_list(1000)
    for client in clients:
        created_at = client.get('created_at')
        if created_at:
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    dt = created_at
                if dt.year == year:
                    month_name = months[dt.month - 1]
                    monthly_data[month_name]["clients"] += 1
            except:
                pass
    
    return [
        {
            "month": month,
            "investments": monthly_data[month]["investments"],
            "trades": monthly_data[month]["trades"],
            "clients": monthly_data[month]["clients"]
        }
        for month in months
    ]


# One-time setup endpoint - can be called manually after deployment
@api_router.get("/setup-broker")
async def setup_broker_endpoint():
    """One-time setup endpoint to create or reset the default broker account"""
    try:
        # Check if broker already exists
        existing_broker = await db.users.find_one({"pan": "ANVPB5297J"})
        
        if existing_broker:
            # RESET the password, pin, role and email to fix any issues
            new_password_hash = get_password_hash("Laksh@0208")
            new_pin_hash = get_password_hash("0516")
            
            await db.users.update_one(
                {"pan": "ANVPB5297J"},
                {"$set": {
                    "password_hash": new_password_hash,
                    "pin_hash": new_pin_hash,
                    "email": "pbisani89@gmail.com",
                    "role": "broker",  # Ensure role is main broker (admin)
                    "name": "Punit Bisani"
                }}
            )
            return {
                "status": "reset", 
                "message": "Broker account has been reset to ADMIN role",
                "credentials": {
                    "pan": "ANVPB5297J",
                    "password": "Laksh@0208",
                    "pin": "0516",
                    "email": "pbisani89@gmail.com",
                    "role": "broker (ADMIN)"
                }
            }
        
        # Create the default broker account
        broker_data = {
            "id": str(uuid.uuid4()),
            "pan": "ANVPB5297J",
            "name": "Punit Bisani",
            "email": "pbisani89@gmail.com",
            "phone": "+91-9999999999",
            "password_hash": get_password_hash("Laksh@0208"),
            "pin_hash": get_password_hash("0516"),
            "role": "broker",  # Main broker (admin)
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(broker_data)
        return {"status": "created", "message": "Broker account created successfully", "pan": "ANVPB5297J", "role": "broker (ADMIN)"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Clear all data endpoint - keeps only the admin broker
@api_router.get("/clear-all-data")
async def clear_all_data():
    """Clear all data except the admin broker account"""
    try:
        deleted_counts = {}
        
        # Delete all users except the admin broker
        result = await db.users.delete_many({"pan": {"$ne": "ANVPB5297J"}})
        deleted_counts["users"] = result.deleted_count
        
        # Delete all clients
        result = await db.clients.delete_many({})
        deleted_counts["clients"] = result.deleted_count
        
        # Delete all sub-brokers/partners
        result = await db.partners.delete_many({})
        deleted_counts["partners"] = result.deleted_count
        
        # Delete all bonds
        result = await db.bonds.delete_many({})
        deleted_counts["bonds"] = result.deleted_count
        
        # Delete all real estate opportunities
        result = await db.real_estate_opportunities.delete_many({})
        deleted_counts["real_estate"] = result.deleted_count
        
        # Delete all trades
        result = await db.trades.delete_many({})
        deleted_counts["trades"] = result.deleted_count
        
        # Delete all holdings
        result = await db.holdings.delete_many({})
        deleted_counts["holdings"] = result.deleted_count
        
        # Delete all holding cashflows
        result = await db.holding_cashflows.delete_many({})
        deleted_counts["holding_cashflows"] = result.deleted_count
        
        # Delete all real estate investments
        result = await db.real_estate_investments.delete_many({})
        deleted_counts["real_estate_investments"] = result.deleted_count
        
        # Delete all currency projections
        result = await db.currency_projections.delete_many({})
        deleted_counts["currency_projections"] = result.deleted_count
        
        # Delete all password resets
        result = await db.password_resets.delete_many({})
        deleted_counts["password_resets"] = result.deleted_count
        
        # Delete all activity logs if exists
        try:
            result = await db.activity_logs.delete_many({})
            deleted_counts["activity_logs"] = result.deleted_count
        except:
            pass
        
        return {
            "status": "success",
            "message": "All data cleared except admin broker (ANVPB5297J)",
            "deleted_counts": deleted_counts,
            "preserved": {
                "admin_broker": "ANVPB5297J",
                "email": "pbisani89@gmail.com"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ANALYSIS ENDPOINTS ====================

@api_router.post("/analysis/upload-cas")
async def upload_cas_pdf(
    file: UploadFile = File(...),
    password: str = Form(...),
    client_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and analyze a CAS PDF file"""
    try:
        # Validate client exists and get details for billing
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=404, detail="Client not found. Please select a valid client.")
        
        # Get sub-broker info if client is linked to one
        sub_broker_id = client.get('linked_subbroker_id')
        sub_broker_name = None
        if sub_broker_id:
            sub_broker = await db.partners.find_one({"id": sub_broker_id}, {"_id": 0, "name": 1})
            sub_broker_name = sub_broker.get('name') if sub_broker else None
        
        # Read file content
        content = await file.read()
        
        # Parse the PDF
        parser = CASParser(content, password)
        parsed_data = parser.parse()
        
        # Store analysis result with client and sub-broker info for billing
        analysis_id = str(uuid.uuid4())
        analysis_record = {
            "id": analysis_id,
            "user_id": current_user['id'],
            "user_name": current_user['name'],
            "client_id": client_id,
            "client_name": client.get('name'),
            "client_pan": client.get('pan_number'),
            "sub_broker_id": sub_broker_id,
            "sub_broker_name": sub_broker_name,
            "filename": file.filename,
            "parsed_data": parsed_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "completed"
        }
        
        await db.cas_analyses.insert_one(analysis_record)
        
        return {
            "analysis_id": analysis_id,
            "filename": file.filename,
            "client_name": client.get('name'),
            "sub_broker_name": sub_broker_name,
            "portfolio_summary": parsed_data.get('portfolio_summary', {}),
            "total_folios": len(parsed_data.get('folios', {})),
            "total_transactions": parsed_data.get('total_transactions', 0),
            "status": "completed"
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing CAS PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


@api_router.get("/analysis/{analysis_id}/download")
async def download_gap_sheet(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download the generated Gap Sheet Excel file"""
    try:
        # Get analysis record
        analysis = await db.cas_analyses.find_one({"id": analysis_id})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        # Get scheme master for mapping
        scheme_master = await db.scheme_master.find_one({"type": "bse_master"})
        scheme_mapper = None
        if scheme_master and scheme_master.get('schemes'):
            scheme_mapper = SchemeMapper(scheme_master['schemes'])
        
        # Generate Gap Sheet (ZIP with all reports by PAN and ARN)
        nav_service = NAVService()
        generator = GapSheetGenerator(
            analysis['parsed_data'], 
            nav_service,
            scheme_mapper
        )
        zip_bytes = generator.generate_all_reports()
        
        # Return as downloadable ZIP file
        filename = f"GapSheet_{analysis.get('filename', 'analysis').replace('.pdf', '')}.zip"
        
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(zip_bytes))
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating Gap Sheet: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@api_router.get("/analysis/{analysis_id}")
async def get_analysis_details(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed analysis results"""
    try:
        analysis = await db.cas_analyses.find_one({"id": analysis_id}, {"_id": 0})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/analysis/{analysis_id}/dashboard")
async def get_analysis_dashboard(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard data for an analysis - formatted for visualization"""
    try:
        analysis = await db.cas_analyses.find_one({"id": analysis_id}, {"_id": 0})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        parsed_data = analysis.get('parsed_data', {})
        folios = parsed_data.get('folios', {})
        
        # Get scheme master for type categorization
        scheme_master = await db.scheme_master.find_one({"type": "bse_master"})
        scheme_mapper = None
        if scheme_master and scheme_master.get('schemes'):
            scheme_mapper = SchemeMapper(scheme_master['schemes'])
        
        # Calculate dashboard metrics
        total_investment = 0
        total_current_value = 0
        total_redemptions = 0
        advisor_breakdown = {}
        scheme_breakdown = []
        holdings_by_type = {'Equity': 0, 'Debt': 0, 'Hybrid': 0, 'Other': 0}
        monthly_investments = {}
        
        for folio_key, folio_data in folios.items():
            scheme_name = folio_data.get('scheme', '')
            isin = folio_data.get('isin', '')
            closing_balance = folio_data.get('closing_balance', 0)
            current_nav = folio_data.get('current_nav', 0)
            market_value = folio_data.get('market_value', 0)
            
            # If market_value not available, calculate from NAV
            if not market_value and closing_balance > 0 and current_nav > 1:
                market_value = closing_balance * current_nav
            
            # Categorize by fund type using scheme master
            if scheme_mapper:
                fund_type = scheme_mapper.get_asset_category(isin=isin, scheme_name=scheme_name)
            else:
                # Fallback to keyword matching if no scheme master
                scheme_lower = scheme_name.lower()
                equity_keywords = ['equity', 'index', 'nifty', 'sensex', 'midcap', 'smallcap', 
                                  'large cap', 'multi cap', 'flexi cap', 'bluechip', 'elss', 
                                  'tax saver', 'focused', 'value', 'growth fund']
                debt_keywords = ['debt', 'liquid', 'money market', 'ultra short', 'overnight',
                                'gilt', 'bond', 'income', 'credit risk', 'banking', 'corporate bond',
                                'dynamic bond', 'fixed maturity', 'fmp', 'floating rate']
                hybrid_keywords = ['hybrid', 'balanced', 'aggressive', 'conservative', 'arbitrage',
                                  'equity savings', 'multi asset', 'asset allocation']
                
                if any(kw in scheme_lower for kw in equity_keywords):
                    fund_type = 'Equity'
                elif any(kw in scheme_lower for kw in debt_keywords):
                    fund_type = 'Debt'
                elif any(kw in scheme_lower for kw in hybrid_keywords):
                    fund_type = 'Hybrid'
                else:
                    fund_type = 'Other'
            
            holdings_by_type[fund_type] += market_value
            
            # Process transactions
            for trans in folio_data.get('transactions', []):
                amount = abs(trans.get('amount', 0))
                advisor = trans.get('advisor', 'Direct')
                trans_date = trans.get('date', '')
                
                if trans.get('is_redemption'):
                    total_redemptions += amount
                else:
                    total_investment += amount
                    
                    # Advisor breakdown
                    if advisor not in advisor_breakdown:
                        advisor_breakdown[advisor] = {'invested': 0, 'schemes': set()}
                    advisor_breakdown[advisor]['invested'] += amount
                    advisor_breakdown[advisor]['schemes'].add(scheme_name[:30])
                    
                    # Monthly investments trend
                    try:
                        from datetime import datetime
                        dt = datetime.strptime(trans_date, '%d-%b-%Y')
                        month_key = dt.strftime('%Y-%m')
                        if month_key not in monthly_investments:
                            monthly_investments[month_key] = 0
                        monthly_investments[month_key] += amount
                    except:
                        pass
            
            # Add to scheme breakdown if has balance
            if closing_balance > 0 and market_value > 0:
                total_current_value += market_value
                scheme_breakdown.append({
                    'name': scheme_name[:40] + ('...' if len(scheme_name) > 40 else ''),
                    'full_name': scheme_name,
                    'folio': folio_data.get('folio', folio_key),
                    'units': round(closing_balance, 3),
                    'nav': round(current_nav, 4) if current_nav > 1 else None,
                    'value': round(market_value, 2),
                    'type': fund_type
                })
        
        # Sort scheme breakdown by value
        scheme_breakdown.sort(key=lambda x: x['value'], reverse=True)
        
        # Format advisor breakdown
        advisor_list = []
        for advisor, data in advisor_breakdown.items():
            advisor_list.append({
                'name': advisor if advisor else 'Direct',
                'invested': round(data['invested'], 2),
                'schemes_count': len(data['schemes'])
            })
        advisor_list.sort(key=lambda x: x['invested'], reverse=True)
        
        # Format monthly trend (last 12 months)
        sorted_months = sorted(monthly_investments.keys())[-12:]
        monthly_trend = [
            {'month': m, 'amount': monthly_investments.get(m, 0)}
            for m in sorted_months
        ]
        
        # Calculate gains
        total_gains = total_current_value - total_investment + total_redemptions
        gain_percentage = (total_gains / total_investment * 100) if total_investment > 0 else 0
        
        return {
            "analysis_id": analysis_id,
            "client_name": analysis.get('client_name'),
            "filename": analysis.get('filename'),
            "created_at": analysis.get('created_at'),
            "summary": {
                "total_investment": round(total_investment, 2),
                "total_current_value": round(total_current_value, 2),
                "total_redemptions": round(total_redemptions, 2),
                "total_gains": round(total_gains, 2),
                "gain_percentage": round(gain_percentage, 2),
                "total_folios": len(folios),
                "active_schemes": len([s for s in scheme_breakdown if s['value'] > 0])
            },
            "holdings_by_type": holdings_by_type,
            "top_holdings": scheme_breakdown[:10],
            "all_holdings": scheme_breakdown,
            "advisor_breakdown": advisor_list[:10],
            "monthly_trend": monthly_trend
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/analysis")
async def list_analyses(current_user: dict = Depends(get_current_user)):
    """List all analyses for the current user (or all for broker)"""
    try:
        query = {}
        if current_user['role'] != 'broker':
            query['user_id'] = current_user['id']
        
        analyses = await db.cas_analyses.find(
            query,
            {"_id": 0, "parsed_data": 0}  # Exclude large data from list
        ).sort("created_at", -1).to_list(100)
        
        return analyses
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/analysis/{analysis_id}")
async def delete_analysis(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an analysis record"""
    try:
        analysis = await db.cas_analyses.find_one({"id": analysis_id})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        # Only owner or broker can delete
        if current_user['role'] != 'broker' and analysis['user_id'] != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
        
        await db.cas_analyses.delete_one({"id": analysis_id})
        
        return {"message": "Analysis deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Scheme Master Management
@api_router.post("/analysis/upload-scheme-master")
async def upload_scheme_master(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload BSE scheme master file (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload scheme master")
    
    try:
        content = await file.read()
        text_content = content.decode('utf-8', errors='ignore')
        
        # Parse the scheme master file
        schemes = parse_scheme_master_file(text_content)
        
        if not schemes:
            raise HTTPException(status_code=400, detail="Could not parse scheme master file")
        
        # Update or create scheme master record
        existing = await db.scheme_master.find_one({"type": "bse_master"})
        
        if existing:
            # Merge new schemes with existing (append unique)
            existing_isins = {s.get('isin') for s in existing.get('schemes', [])}
            new_schemes = [s for s in schemes if s.get('isin') not in existing_isins]
            
            await db.scheme_master.update_one(
                {"type": "bse_master"},
                {
                    "$push": {"schemes": {"$each": new_schemes}},
                    "$set": {
                        "last_upload": datetime.now(timezone.utc).isoformat(),
                        "last_upload_by": current_user['id'],
                        "last_filename": file.filename,
                        "total_schemes": len(existing.get('schemes', [])) + len(new_schemes)
                    }
                }
            )
            added_count = len(new_schemes)
        else:
            await db.scheme_master.insert_one({
                "type": "bse_master",
                "schemes": schemes,
                "total_schemes": len(schemes),
                "last_upload": datetime.now(timezone.utc).isoformat(),
                "last_upload_by": current_user['id'],
                "last_filename": file.filename,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            added_count = len(schemes)
        
        return {
            "message": "Scheme master uploaded successfully",
            "schemes_added": added_count,
            "total_schemes_in_file": len(schemes),
            "filename": file.filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading scheme master: {e}")
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")


@api_router.get("/analysis/scheme-master/status")
async def get_scheme_master_status(current_user: dict = Depends(get_current_user)):
    """Get scheme master file status"""
    try:
        master = await db.scheme_master.find_one(
            {"type": "bse_master"},
            {"_id": 0, "schemes": 0}  # Exclude large data
        )
        
        if not master:
            return {
                "exists": False,
                "total_schemes": 0,
                "last_upload": None
            }
        
        return {
            "exists": True,
            "total_schemes": master.get('total_schemes', 0),
            "last_upload": master.get('last_upload'),
            "last_filename": master.get('last_filename'),
            "last_upload_by": master.get('last_upload_by')
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== END ANALYSIS ENDPOINTS ====================


# ==================== FOREX RATE ENDPOINT ====================

@api_router.get("/forex/aed-to-inr")
async def get_aed_to_inr_rate():
    """Get current AED to INR exchange rate from free API"""
    import aiohttp
    
    try:
        # Using the free exchange rate API
        async with aiohttp.ClientSession() as session:
            # Try primary API first
            try:
                async with session.get(
                    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/aed.json",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        inr_rate = data.get('aed', {}).get('inr', 22.5)
                        return {
                            "rate": inr_rate,
                            "source": "fawazahmed0/currency-api",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
            except Exception:
                pass
            
            # Fallback to alternative API
            try:
                async with session.get(
                    "https://api.exchangerate-api.com/v4/latest/AED",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        inr_rate = data.get('rates', {}).get('INR', 22.5)
                        return {
                            "rate": inr_rate,
                            "source": "exchangerate-api",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
            except Exception:
                pass
        
        # Default fallback rate if APIs fail
        return {
            "rate": 22.5,
            "source": "fallback",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        # Return fallback rate on any error
        return {
            "rate": 22.5,
            "source": "fallback",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


# ==================== SUB-BROKER DASHBOARD ENDPOINTS ====================

@api_router.get("/sub-broker/dashboard/summary")
async def get_sub_broker_dashboard_summary(current_user: dict = Depends(get_current_user)):
    """Get dashboard summary for sub-broker - showing only their linked clients"""
    if current_user['role'] != 'sub_broker':
        raise HTTPException(status_code=403, detail="Only sub-brokers can access this endpoint")
    
    sub_broker_id = current_user['id']
    
    # Get clients linked to this sub-broker
    linked_clients = await db.clients.find(
        {"linked_subbroker_id": sub_broker_id},
        {"_id": 0}
    ).to_list(1000)
    
    client_ids = [c.get('id') for c in linked_clients]
    total_clients = len(linked_clients)
    active_clients = len([c for c in linked_clients if c.get('is_active', True)])
    
    # Count clients by product type
    bond_clients = 0
    re_clients = 0
    both_clients = 0
    
    for client in linked_clients:
        has_bonds = bool(client.get('bond_allocations', []))
        has_re = False
        # Check real estate investments
        re_opps = await db.real_estate_opportunities.find(
            {"investors.client_id": client.get('id')},
            {"_id": 0}
        ).to_list(1)
        has_re = len(re_opps) > 0
        
        if has_bonds and has_re:
            both_clients += 1
        elif has_bonds:
            bond_clients += 1
        elif has_re:
            re_clients += 1
    
    # Calculate Bond AUM for linked clients
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    total_bond_invested = 0
    total_bond_repaid = 0
    total_bond_pending = 0
    
    for client in linked_clients:
        allocations = client.get('bond_allocations', [])
        for alloc in allocations:
            bond = next((b for b in bonds if b.get('id') == alloc.get('bond_id')), None)
            if bond:
                face_value = bond.get('face_value', 0)
                units_paid = alloc.get('units_paid', 0)
                total_bond_invested += units_paid * face_value
                
                # Calculate repaid from cashflows
                cashflows = alloc.get('cashflows', [])
                for cf in cashflows:
                    if cf.get('type') == 'principal_repayment':
                        total_bond_repaid += cf.get('amount', 0)
    
    total_bond_pending = total_bond_invested - total_bond_repaid
    
    # Calculate Real Estate AUM for linked clients
    real_estate_opps = await db.real_estate_opportunities.find({}, {"_id": 0}).to_list(1000)
    total_re_deal_size = 0
    total_re_paid = 0
    
    for re in real_estate_opps:
        investors = re.get('investors', [])
        for inv in investors:
            if inv.get('client_id') in client_ids:
                share_pct = inv.get('share_percentage', inv.get('percentage', 0))
                total_cost = re.get('total_cost', 0)
                total_re_deal_size += total_cost * share_pct / 100
                
                # Calculate paid amount
                payments = inv.get('payments', [])
                for payment in payments:
                    total_re_paid += payment.get('amount', 0)
    
    return {
        "clients": {
            "total": total_clients,
            "active": active_clients,
            "bond_only": bond_clients,
            "real_estate_only": re_clients,
            "both_products": both_clients
        },
        "bond_aum": {
            "total_invested": total_bond_invested,
            "total_repaid": total_bond_repaid,
            "total_pending": total_bond_pending
        },
        "real_estate_aum": {
            "total_deal_size": total_re_deal_size,
            "total_paid": total_re_paid
        }
    }


# ==================== LEADS MANAGEMENT ====================

class CreateLeadRequest(BaseModel):
    """Request model for creating a lead from client interest"""
    opportunity_type: str  # 'bond' or 'real_estate'
    opportunity_id: str
    investment_amount: Optional[float] = None  # For bonds
    interest_percentage: Optional[float] = None  # For real estate
    notes: str = ""


class UpdateLeadStatusRequest(BaseModel):
    """Request model for updating lead status"""
    status: str  # 'open', 'closed', 'not_interested'


class SignupInterestRequest(BaseModel):
    """Request model for signup page interest form"""
    name: str
    email: str
    phone: str
    source: str = "signup_page"


@api_router.post("/leads/interest")
async def create_signup_interest(request: SignupInterestRequest):
    """Create a lead from signup page interest form (no auth required)"""
    # Validate required fields
    if not request.name or not request.email or not request.phone:
        raise HTTPException(status_code=400, detail="Name, email and phone are required")
    
    # Check if lead already exists with same email
    existing_lead = await db.leads.find_one({
        "client_email": request.email.lower(),
        "source": "signup_page"
    })
    
    if existing_lead:
        # Update existing lead
        await db.leads.update_one(
            {"id": existing_lead['id']},
            {"$set": {
                "client_name": request.name.strip(),
                "client_mobile": request.phone.strip(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Interest updated successfully", "lead_id": existing_lead['id']}
    
    # Create new lead record for signup interest
    lead = {
        "id": str(uuid.uuid4()),
        "client_id": None,  # Not yet a client
        "client_name": request.name.strip(),
        "client_pan": "",
        "client_mobile": request.phone.strip(),
        "client_email": request.email.strip().lower(),
        "client_city": "",
        "opportunity_type": "general",  # General interest, not tied to specific opportunity
        "opportunity_id": None,
        "product_name": "General Interest",
        "product_code": "",
        "investment_amount": None,
        "interest_percentage": None,
        "notes": f"Interested via {request.source}",
        "status": "open",
        "source": request.source,
        "shared_by_id": None,
        "shared_by_name": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.leads.insert_one(lead)
    
    # Create notification for broker
    broker = await db.users.find_one({"role": "broker"}, {"_id": 0, "id": 1})
    if broker:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": broker['id'],
            "type": "new_lead",
            "title": "New Signup Interest!",
            "message": f"{request.name} registered interest via website. Email: {request.email}, Phone: {request.phone}",
            "lead_id": lead['id'],
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    return {"message": "Interest recorded successfully", "lead_id": lead['id']}


@api_router.post("/leads")
async def create_lead(request: CreateLeadRequest, current_user: dict = Depends(get_current_user)):
    """Create a new lead when client expresses interest"""
    # Get opportunity details
    if request.opportunity_type == 'bond':
        opportunity = await db.bonds.find_one({"id": request.opportunity_id}, {"_id": 0})
        if not opportunity:
            raise HTTPException(status_code=404, detail="Bond not found")
        product_name = opportunity.get('name', 'Unknown Bond')
        product_code = opportunity.get('bond_code', '')
    else:
        opportunity = await db.real_estate_opportunities.find_one({"id": request.opportunity_id}, {"_id": 0})
        if not opportunity:
            raise HTTPException(status_code=404, detail="Real estate opportunity not found")
        product_name = f"{opportunity.get('building_name', 'Unknown')} - Unit {opportunity.get('unit_no', '')}"
        product_code = opportunity.get('id', '')[:8]
    
    # Get client details
    client = None
    client_sub_broker_id = None
    if current_user['role'] == 'client':
        client = await db.clients.find_one({"id": current_user.get('client_id')}, {"_id": 0})
        if client:
            # Get the sub-broker who manages this client (if any)
            client_sub_broker_id = client.get('sub_broker_id') or client.get('created_by_sub_broker')
    
    # Find the sub-broker/broker who shared this with the client
    shared_by_id = None
    shared_by_name = None
    
    if request.opportunity_type == 'real_estate':
        shares = opportunity.get('shares', [])
        for share in shares:
            if share.get('client_id') == current_user.get('client_id', current_user['id']):
                shared_by_id = share.get('shared_by')
                # Get the name of who shared
                sharer = await db.users.find_one({"id": shared_by_id}, {"_id": 0, "name": 1})
                if sharer:
                    shared_by_name = sharer.get('name')
                break
    
    # For bonds or if no shared_by_id found, use the client's sub-broker
    if not shared_by_id and client_sub_broker_id:
        shared_by_id = client_sub_broker_id
        sharer = await db.users.find_one({"id": shared_by_id}, {"_id": 0, "name": 1})
        if sharer:
            shared_by_name = sharer.get('name')
    
    # Create lead record
    lead = {
        "id": str(uuid.uuid4()),
        "client_id": current_user.get('client_id', current_user['id']),
        "client_name": client.get('name') if client else current_user.get('name', 'Unknown'),
        "client_pan": client.get('pan_number') if client else current_user.get('pan_number', ''),
        "client_mobile": client.get('mobile') if client else '',
        "client_email": client.get('email') if client else '',
        "client_city": client.get('city') if client else '',
        "opportunity_type": request.opportunity_type,
        "opportunity_id": request.opportunity_id,
        "product_name": product_name,
        "product_code": product_code,
        "investment_amount": request.investment_amount,
        "interest_percentage": request.interest_percentage,
        "notes": request.notes,
        "status": "open",
        "shared_by_id": shared_by_id,
        "shared_by_name": shared_by_name,
        "sub_broker_id": client_sub_broker_id,  # Also store the client's sub-broker for easy querying
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.leads.insert_one(lead)
    
    # Update interested_count on the opportunity
    if request.opportunity_type == 'bond':
        await db.bonds.update_one(
            {"id": request.opportunity_id},
            {"$inc": {"interested_count": 1}}
        )
    else:
        await db.real_estate_opportunities.update_one(
            {"id": request.opportunity_id},
            {"$inc": {"interested_count": 1}}
        )
    
    # Create notification for broker/sub-broker
    broker = await db.users.find_one({"role": "broker"}, {"_id": 0, "id": 1})
    if broker:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": shared_by_id or broker['id'],
            "type": "new_lead",
            "title": "New Lead Created!",
            "message": f"{lead['client_name']} expressed interest in {product_name}" + 
                       (f" - ₹{request.investment_amount:,.0f}" if request.investment_amount else "") +
                       (f" - {request.interest_percentage}%" if request.interest_percentage else ""),
            "lead_id": lead['id'],
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    return {"message": "Interest recorded successfully", "lead_id": lead['id']}


@api_router.get("/leads")
async def get_leads(
    status: Optional[str] = None,
    opportunity_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all leads - for brokers/sub-brokers"""
    if current_user['role'] == 'client':
        raise HTTPException(status_code=403, detail="Clients cannot access leads")
    
    query = {}
    
    # Sub-brokers see leads from:
    # 1. Opportunities they shared (shared_by_id matches)
    # 2. Their managed clients (sub_broker_id matches)
    if current_user['role'] == 'sub_broker':
        query["$or"] = [
            {"shared_by_id": current_user['id']},
            {"sub_broker_id": current_user['id']}
        ]
    
    if status:
        if current_user['role'] == 'sub_broker':
            # Combine with existing $or query
            query = {"$and": [query, {"status": status}]}
        else:
            query["status"] = status
    if opportunity_type:
        if current_user['role'] == 'sub_broker' and "$and" in query:
            query["$and"].append({"opportunity_type": opportunity_type})
        elif current_user['role'] == 'sub_broker':
            query = {"$and": [query, {"opportunity_type": opportunity_type}]}
        else:
            query["opportunity_type"] = opportunity_type
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return leads


@api_router.put("/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: str,
    request: UpdateLeadStatusRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update lead status"""
    if current_user['role'] == 'client':
        raise HTTPException(status_code=403, detail="Clients cannot update leads")
    
    if request.status not in ['open', 'closed', 'not_interested']:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Sub-brokers can update leads they shared OR leads from their managed clients
    if current_user['role'] == 'sub_broker':
        is_shared_by_them = lead.get('shared_by_id') == current_user['id']
        is_their_client = lead.get('sub_broker_id') == current_user['id']
        if not (is_shared_by_them or is_their_client):
            raise HTTPException(status_code=403, detail="You can only update leads from your clients or opportunities you shared")
    
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {
            "status": request.status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user['id']
        }}
    )
    
    return {"message": "Lead status updated successfully"}


@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single lead by ID"""
    if current_user['role'] == 'client':
        raise HTTPException(status_code=403, detail="Clients cannot access leads")
    
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return lead


# ==================== PROJECTED VS ACTUALS COMPARISON ====================

@api_router.get("/holdings/cashflow-comparison/{client_id}")
async def get_cashflow_comparison(
    client_id: str,
    bond_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get projected vs actual cashflow comparison for a client.
    Returns both projected cashflows (system-generated) and actual repayments (uploaded via historical trades).
    """
    # Clients can only view their own data
    if current_user['role'] == 'client':
        if current_user.get('client_id') != client_id:
            raise HTTPException(status_code=403, detail="You can only view your own cashflow comparison")
    
    # Build query for projected cashflows
    projected_query = {"client_id": client_id}
    if bond_id:
        projected_query["bond_id"] = bond_id
    
    # Get projected cashflows
    projected = await db.holding_cashflows.find(projected_query, {"_id": 0}).to_list(10000)
    
    # Get actual repayments
    actual_query = {"client_id": client_id}
    if bond_id:
        actual_query["bond_id"] = bond_id
    
    actuals = await db.actual_repayments.find(actual_query, {"_id": 0}).to_list(10000)
    
    # Get client's bond investments for context
    trades = await db.trades.find(
        {"client_id": client_id, "status": "approved"}, 
        {"_id": 0}
    ).to_list(100)
    
    # Group by bond and date for comparison
    comparison = {}
    
    # Process projected cashflows
    for cf in projected:
        bond_id_key = cf.get('bond_id', 'unknown')
        date_key = cf.get('date', cf.get('payment_date', ''))
        
        if bond_id_key not in comparison:
            comparison[bond_id_key] = {
                "bond_name": cf.get('bond_name', ''),
                "dates": {}
            }
        
        if date_key not in comparison[bond_id_key]['dates']:
            comparison[bond_id_key]['dates'][date_key] = {
                "projected_interest": 0,
                "projected_principal": 0,
                "projected_total": 0,
                "actual_interest": 0,
                "actual_principal": 0,
                "actual_gross": 0,
                "actual_tds": 0,
                "actual_net": 0,
                "variance": 0,
                "status": "pending"
            }
        
        comparison[bond_id_key]['dates'][date_key]['projected_interest'] += cf.get('interest', cf.get('interest_amount', 0)) or 0
        comparison[bond_id_key]['dates'][date_key]['projected_principal'] += cf.get('principal', cf.get('principal_amount', 0)) or 0
        comparison[bond_id_key]['dates'][date_key]['projected_total'] = (
            comparison[bond_id_key]['dates'][date_key]['projected_interest'] + 
            comparison[bond_id_key]['dates'][date_key]['projected_principal']
        )
    
    # Process actual repayments
    for ar in actuals:
        bond_id_key = ar.get('bond_id', 'unknown')
        date_key = ar.get('repayment_date', '')
        
        if bond_id_key not in comparison:
            comparison[bond_id_key] = {
                "bond_name": ar.get('bond_name', ''),
                "dates": {}
            }
        
        if date_key not in comparison[bond_id_key]['dates']:
            comparison[bond_id_key]['dates'][date_key] = {
                "projected_interest": 0,
                "projected_principal": 0,
                "projected_total": 0,
                "actual_interest": 0,
                "actual_principal": 0,
                "actual_gross": 0,
                "actual_tds": 0,
                "actual_net": 0,
                "variance": 0,
                "status": "unplanned"  # Actual without projected
            }
        
        comparison[bond_id_key]['dates'][date_key]['actual_interest'] += ar.get('interest', 0) or 0
        comparison[bond_id_key]['dates'][date_key]['actual_principal'] += ar.get('principal', 0) or 0
        comparison[bond_id_key]['dates'][date_key]['actual_gross'] += ar.get('gross_amount', 0) or 0
        comparison[bond_id_key]['dates'][date_key]['actual_tds'] += ar.get('tds', 0) or 0
        comparison[bond_id_key]['dates'][date_key]['actual_net'] += ar.get('net_amount', 0) or 0
    
    # Calculate variance and status for each date
    summary = {
        "total_projected": 0,
        "total_actual": 0,
        "total_variance": 0,
        "on_track": 0,
        "shortfall": 0,
        "excess": 0,
        "pending": 0
    }
    
    for bond_id_key, bond_data in comparison.items():
        for date_key, data in bond_data['dates'].items():
            projected = data['projected_total']
            actual = data['actual_net']
            
            data['variance'] = actual - projected
            
            summary['total_projected'] += projected
            summary['total_actual'] += actual
            summary['total_variance'] += data['variance']
            
            # Determine status
            if projected > 0 and actual > 0:
                variance_pct = abs(data['variance']) / projected * 100 if projected > 0 else 0
                if variance_pct <= 5:
                    data['status'] = 'on_track'
                    summary['on_track'] += 1
                elif actual < projected:
                    data['status'] = 'shortfall'
                    summary['shortfall'] += 1
                else:
                    data['status'] = 'excess'
                    summary['excess'] += 1
            elif projected > 0 and actual == 0:
                data['status'] = 'pending'
                summary['pending'] += 1
            elif actual > 0:
                data['status'] = 'unplanned'
    
    return {
        "client_id": client_id,
        "comparison": comparison,
        "summary": summary,
        "trades": trades
    }


@api_router.get("/actual-repayments")
async def get_actual_repayments(
    client_id: Optional[str] = None,
    bond_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get actual repayment records"""
    query = {}
    
    if current_user['role'] == 'client':
        query['client_id'] = current_user.get('client_id')
    elif client_id:
        query['client_id'] = client_id
    
    if bond_id:
        query['bond_id'] = bond_id
    
    repayments = await db.actual_repayments.find(query, {"_id": 0}).sort("repayment_date", -1).to_list(10000)
    return repayments


# ==================== TRADE TAGGING WORKFLOW ====================

class TagTradeRequest(BaseModel):
    """Request model for tagging a trade"""
    ucc: str
    portfolio: str
    tagged_amount: Optional[float] = None
    notes: Optional[str] = None


@api_router.get("/trades/untagged")
async def get_untagged_trades(
    client_id: Optional[str] = None,
    bond_id: Optional[str] = None,
    date_filter: Optional[str] = None,  # 'past' or 'future'
    current_user: dict = Depends(get_current_user)
):
    """Get all untagged trades for broker/sub-broker to tag"""
    if current_user['role'] == 'client':
        raise HTTPException(status_code=403, detail="Clients cannot access untagged trades")
    
    query = {"status": "untagged"}
    
    if client_id:
        query["client_id"] = client_id
    if bond_id:
        query["bond_id"] = bond_id
    
    # Filter by date type
    if date_filter == 'past':
        query["is_past_dated"] = True
    elif date_filter == 'future':
        query["is_past_dated"] = False
    
    # Sub-brokers can only see their clients' trades
    if current_user['role'] == 'sub_broker':
        sub_broker_clients = await db.clients.find(
            {"created_by": current_user['id']}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        client_ids = [c['id'] for c in sub_broker_clients]
        query["client_id"] = {"$in": client_ids}
    
    trades = await db.trades.find(query, {"_id": 0}).sort("investment_date", 1).to_list(10000)
    return trades


@api_router.get("/trades/pending-approval")
async def get_pending_approval_trades(current_user: dict = Depends(get_current_user)):
    """Get trades pending client approval (future-dated, tagged but not approved)"""
    query = {
        "tagging_status": "tagged",
        "is_past_dated": False,
        "client_approved": False
    }
    
    if current_user['role'] == 'client':
        query["client_id"] = current_user.get('client_id')
    elif current_user['role'] == 'sub_broker':
        sub_broker_clients = await db.clients.find(
            {"created_by": current_user['id']}, 
            {"_id": 0, "id": 1}
        ).to_list(1000)
        client_ids = [c['id'] for c in sub_broker_clients]
        query["client_id"] = {"$in": client_ids}
    
    trades = await db.trades.find(query, {"_id": 0}).sort("investment_date", 1).to_list(10000)
    return trades


@api_router.put("/trades/{trade_id}/tag")
async def tag_trade(
    trade_id: str,
    request: TagTradeRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Tag a trade with UCC, portfolio, and amount.
    For past-dated: Automatically approved after tagging
    For future-dated: Requires client approval after tagging
    """
    if current_user['role'] == 'client':
        raise HTTPException(status_code=403, detail="Clients cannot tag trades")
    
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Check if already client approved (cannot edit)
    if trade.get('client_approved'):
        raise HTTPException(status_code=400, detail="Cannot edit a client-approved trade")
    
    # Sub-broker can only tag their clients' trades
    if current_user['role'] == 'sub_broker':
        client = await db.clients.find_one({"id": trade['client_id']}, {"_id": 0})
        if not client or client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="You can only tag your own clients' trades")
    
    tagged_amount = request.tagged_amount or trade.get('total_amount', 0)
    is_past_dated = trade.get('is_past_dated', True)
    
    update_data = {
        "ucc": request.ucc,
        "portfolio": request.portfolio,
        "tagged_amount": tagged_amount,
        "tagged_by": current_user['id'],
        "tagged_by_name": current_user.get('name', ''),
        "tagged_at": datetime.now(timezone.utc).isoformat(),
        "tagging_status": "tagged",
        "broker_notes": request.notes or trade.get('broker_notes', '')
    }
    
    # For past-dated trades, auto-approve and finalize
    if is_past_dated:
        update_data["status"] = "approved"
        update_data["approved_by"] = current_user['id']
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
        
        # Update bond units and client allocation
        bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
        if bond:
            await db.bonds.update_one(
                {"id": trade['bond_id']},
                {"$inc": {"units_sold": trade['units']}}
            )
            
            allocation = {
                "bond_id": trade['bond_id'],
                "bond_name": trade['bond_name'],
                "units_blocked": trade['units'],
                "units_paid": trade['units'],
                "status": "fully_paid",
                "trade_id": trade_id,
                "ucc": request.ucc,
                "portfolio": request.portfolio,
                "allocated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.clients.update_one(
                {"id": trade['client_id']},
                {"$push": {"bond_allocations": allocation}}
            )
            
            # Generate cashflows
            trade_with_updates = {**trade, **update_data}
            cashflows = generate_client_cashflows(trade_with_updates, bond)
            if cashflows:
                for cf in cashflows:
                    cf['client_id'] = trade['client_id']
                    cf['bond_id'] = trade['bond_id']
                    cf['type'] = 'projected'
                await db.holding_cashflows.insert_many(cashflows)
    
    await db.trades.update_one({"id": trade_id}, {"$set": update_data})
    
    return {
        "message": "Trade tagged successfully" + (" and approved" if is_past_dated else " - pending client approval"),
        "trade_id": trade_id,
        "status": update_data.get("status", "untagged"),
        "requires_client_approval": not is_past_dated
    }


@api_router.put("/trades/{trade_id}/client-approve")
async def client_approve_trade(trade_id: str, current_user: dict = Depends(get_current_user)):
    """Client approves a tagged future-dated trade"""
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can approve trades")
    
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Verify client owns this trade
    if trade.get('client_id') != current_user.get('client_id'):
        raise HTTPException(status_code=403, detail="You can only approve your own trades")
    
    # Must be tagged first
    if trade.get('tagging_status') != 'tagged':
        raise HTTPException(status_code=400, detail="Trade must be tagged before approval")
    
    # Must be future-dated
    if trade.get('is_past_dated'):
        raise HTTPException(status_code=400, detail="Past-dated trades are auto-approved")
    
    # Already approved?
    if trade.get('client_approved'):
        raise HTTPException(status_code=400, detail="Trade already approved")
    
    # Approve and finalize
    update_data = {
        "client_approved": True,
        "client_approved_at": datetime.now(timezone.utc).isoformat(),
        "status": "approved",
        "approved_by": current_user['id'],
        "approved_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update bond units and client allocation
    bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
    if bond:
        await db.bonds.update_one(
            {"id": trade['bond_id']},
            {"$inc": {"units_sold": trade['units']}}
        )
        
        allocation = {
            "bond_id": trade['bond_id'],
            "bond_name": trade['bond_name'],
            "units_blocked": trade['units'],
            "units_paid": trade['units'],
            "status": "fully_paid",
            "trade_id": trade_id,
            "ucc": trade.get('ucc'),
            "portfolio": trade.get('portfolio'),
            "allocated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clients.update_one(
            {"id": trade['client_id']},
            {"$push": {"bond_allocations": allocation}}
        )
        
        # Generate cashflows
        trade_with_updates = {**trade, **update_data}
        cashflows = generate_client_cashflows(trade_with_updates, bond)
        if cashflows:
            for cf in cashflows:
                cf['client_id'] = trade['client_id']
                cf['bond_id'] = trade['bond_id']
                cf['type'] = 'projected'
            await db.holding_cashflows.insert_many(cashflows)
    
    await db.trades.update_one({"id": trade_id}, {"$set": update_data})
    
    return {"message": "Trade approved successfully", "trade_id": trade_id}


@api_router.put("/trades/{trade_id}/reject")
async def client_reject_trade(trade_id: str, reason: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Client rejects a tagged future-dated trade"""
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can reject trades")
    
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade.get('client_id') != current_user.get('client_id'):
        raise HTTPException(status_code=403, detail="You can only reject your own trades")
    
    if trade.get('client_approved'):
        raise HTTPException(status_code=400, detail="Cannot reject an already approved trade")
    
    await db.trades.update_one(
        {"id": trade_id},
        {"$set": {
            "status": "rejected",
            "rejected_by": current_user['id'],
            "rejected_at": datetime.now(timezone.utc).isoformat(),
            "rejection_reason": reason
        }}
    )
    
    return {"message": "Trade rejected", "trade_id": trade_id}


# Reset broker password endpoint
@api_router.get("/reset-broker-password")
async def reset_broker_password():
    """Reset the broker password to fix authentication issues"""
    try:
        # Find broker
        existing_broker = await db.users.find_one({"pan": "ANVPB5297J"})
        
        if not existing_broker:
            return {"status": "error", "message": "Broker account not found"}
        
        # Update password and pin with fresh hashes
        new_password_hash = get_password_hash("Laksh@0208")
        new_pin_hash = get_password_hash("0516")
        
        await db.users.update_one(
            {"pan": "ANVPB5297J"},
            {"$set": {
                "password_hash": new_password_hash,
                "pin_hash": new_pin_hash
            }}
        )
        
        return {
            "status": "success", 
            "message": "Broker password reset successfully",
            "credentials": {
                "pan": "ANVPB5297J",
                "password": "Laksh@0208",
                "pin": "0516"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/fix-repaid-amounts")
async def fix_repaid_amounts(current_user: dict = Depends(get_current_user)):
    """
    Fix repaid_actual_amount in holding_cashflows to use GROSS amount (principal + interest).
    Also sets repaid_date to scheduled date if not already set.
    This ensures XIRR calculation uses pre-TDS amounts.
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can run this fix")
    
    # Find all repaid cashflows
    repaid_cashflows = await db.holding_cashflows.find({"is_repaid": True}).to_list(10000)
    
    results = {
        "total_found": len(repaid_cashflows),
        "updated": 0,
        "dates_fixed": 0,
        "details": []
    }
    
    for cf in repaid_cashflows:
        # Calculate gross amount = principal + interest (before TDS)
        principal = cf.get('principal_component', 0) or 0
        interest = cf.get('interest_component', 0) or 0
        gross_amount = principal + interest
        
        current_actual = cf.get('repaid_actual_amount', 0) or 0
        scheduled_date = cf.get('date', '')[:10] if cf.get('date') else None
        current_repaid_date = cf.get('repaid_date')
        
        # Prepare update
        update_fields = {"repaid_actual_amount": gross_amount}
        
        # Set repaid_date to scheduled date if not already set
        if not current_repaid_date and scheduled_date:
            update_fields["repaid_date"] = scheduled_date
            results['dates_fixed'] += 1
        
        # Update the record with gross amount and repaid_date
        result = await db.holding_cashflows.update_one(
            {"id": cf.get('id')},
            {"$set": update_fields}
        )
        
        if result.modified_count > 0:
            results['updated'] += 1
            results['details'].append({
                "date": scheduled_date,
                "old_amount": current_actual,
                "new_amount": gross_amount,
                "repaid_date_set": not current_repaid_date
            })
    
    return results


@api_router.get("/admin/debug-actual-repayments/{client_id}")
async def debug_actual_repayments(client_id: str, current_user: dict = Depends(get_current_user)):
    """Debug endpoint to view actual_repayments for a client"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this")
    
    # Get all actual repayments for this client
    actual_repayments = await db.actual_repayments.find(
        {"client_id": client_id}, 
        {"_id": 0}
    ).to_list(100)
    
    # Get all holding_cashflows for this client's trades
    trades = await db.trades.find({"client_id": client_id}, {"_id": 0, "id": 1}).to_list(100)
    trade_ids = [t['id'] for t in trades]
    
    cashflows = await db.holding_cashflows.find(
        {"trade_id": {"$in": trade_ids}},
        {"_id": 0}
    ).to_list(500)
    
    # Get unique scheduled dates
    scheduled_dates = set()
    for cf in cashflows:
        if cf.get('date'):
            scheduled_dates.add(cf['date'].split('T')[0])
    
    return {
        "actual_repayments_count": len(actual_repayments),
        "actual_repayments": actual_repayments,
        "holding_cashflows_count": len(cashflows),
        "scheduled_dates": sorted(list(scheduled_dates)),
        "trade_count": len(trades)
    }



# Include the router in the main app
app.include_router(api_router)

# Mount static files for uploads directory at /api/uploads
# The /api prefix ensures routing through the backend (K8s ingress routes /api to backend)
uploads_path = Path("/app/uploads")
if uploads_path.exists():
    app.mount("/api/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def seed_default_broker():
    """Create default broker account if it doesn't exist"""
    try:
        logger.info("Starting broker seeding process...")
        # Check if broker already exists
        existing_broker = await db.users.find_one({"pan": "ANVPB5297J"})
        
        if not existing_broker:
            # Create the default broker account
            broker_data = {
                "id": str(uuid.uuid4()),
                "pan": "ANVPB5297J",
                "name": "Punit Bisani",
                "email": "pbisani89@gmail.com",
                "phone": "+91-9999999999",
                "password_hash": get_password_hash("Laksh@0208"),
                "pin_hash": get_password_hash("0516"),
                "role": "broker",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(broker_data)
            logger.info("Default broker account created successfully: ANVPB5297J")
        else:
            logger.info("Broker account already exists: ANVPB5297J")
    except Exception as e:
        logger.error(f"Error seeding default broker: {e}")

@app.on_event("startup")
async def create_database_indexes():
    """Create database indexes for better query performance"""
    try:
        logger.info("Creating database indexes...")
        
        # Users collection indexes
        await db.users.create_index("pan", unique=True, sparse=True)
        await db.users.create_index("id", unique=True)
        await db.users.create_index("email", sparse=True)
        await db.users.create_index("role")
        await db.users.create_index("created_by")  # For sub-broker queries
        
        # Bonds collection indexes
        await db.bonds.create_index("id", unique=True)
        await db.bonds.create_index("bond_code", unique=True)
        await db.bonds.create_index("created_by")
        await db.bonds.create_index("listing_status")
        await db.bonds.create_index([("created_at", -1)])  # For sorting
        
        # Real estate opportunities indexes
        await db.real_estate_opportunities.create_index("id", unique=True)
        await db.real_estate_opportunities.create_index("created_by")
        await db.real_estate_opportunities.create_index("status")
        await db.real_estate_opportunities.create_index([("created_at", -1)])
        await db.real_estate_opportunities.create_index("investors.client_id")  # For client investment queries
        await db.real_estate_opportunities.create_index("investors.user_id")
        
        # Clients collection indexes
        await db.clients.create_index("id", unique=True)
        await db.clients.create_index("pan_number", sparse=True)
        await db.clients.create_index("created_by")
        await db.clients.create_index("sub_broker_id", sparse=True)
        await db.clients.create_index([("name", 1)])  # For search
        
        # Trades collection indexes
        await db.trades.create_index("id", unique=True)
        await db.trades.create_index("bond_id")
        await db.trades.create_index("client_id")
        await db.trades.create_index("broker_id")
        await db.trades.create_index([("trade_date", -1)])
        await db.trades.create_index("status")
        
        # Activity logs indexes
        await db.activity_logs.create_index([("timestamp", -1)])
        await db.activity_logs.create_index("user_id")
        await db.activity_logs.create_index("action_type")
        
        # Approval workflows indexes
        await db.approval_workflows.create_index("id", unique=True)
        await db.approval_workflows.create_index("status")
        await db.approval_workflows.create_index("workflow_type")
        await db.approval_workflows.create_index([("created_at", -1)])
        
        # Notifications indexes
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("created_at", -1)])
        await db.notifications.create_index("is_read")
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
    except Exception as e:
        logger.error(f"Error seeding default broker: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()