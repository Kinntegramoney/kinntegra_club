import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, Target, Receipt, Eye, Trash2, ChevronRight } from "lucide-react";
import { format } from "date-fns";

export default function FamilyList({ families, onSelect, onDelete }) {
  if (families.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No families yet</h3>
          <p className="text-gray-500">Create your first family to start collecting financial data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {families.map((family) => (
        <Card 
          key={family.id} 
          className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onSelect(family)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-etihad-gold-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{family.family_name}</h3>
                  <p className="text-sm text-gray-500">
                    {family.members?.length || 0} members • Created {format(new Date(family.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <DollarSign className="h-3 w-3 mr-1" />
                    {family.income_details?.length || 0}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Target className="h-3 w-3 mr-1" />
                    {family.goal_details?.length || 0}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Receipt className="h-3 w-3 mr-1" />
                    {family.expense_details?.length || 0}
                  </Badge>
                </div>
                <Badge 
                  className={
                    family.status === 'completed' 
                      ? 'bg-green-100 text-green-700' 
                      : family.status === 'in_progress'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-700'
                  }
                >
                  {family.status || 'Draft'}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(family);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(family.id);
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
