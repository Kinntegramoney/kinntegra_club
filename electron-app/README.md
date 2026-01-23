# Kinntegraa Desktop App

A native Windows/Mac/Linux desktop application for Kinntegraa Investment Platform.

## Features

- ✅ Native Windows installer (.exe)
- ✅ System tray integration
- ✅ Desktop shortcuts
- ✅ Start menu integration
- ✅ Keyboard shortcuts
- ✅ Zoom controls
- ✅ Full-screen mode
- ✅ Single instance (prevents multiple windows)
- ✅ Auto-minimize to tray

## Prerequisites

Before building, you need:

1. **Node.js** (v18 or later) - [Download](https://nodejs.org/)
2. **Git** - [Download](https://git-scm.com/)

## Quick Start

### 1. Install Dependencies

```bash
cd electron-app
npm install
```

### 2. Update App URL

Open `main.js` and update the `APP_URL` to your deployed application URL:

```javascript
const APP_URL = 'https://your-kinntegraa-domain.com';
```

### 3. Build for Windows

```bash
# Build Windows installer
npm run build:win
```

This creates:
- `dist/Kinntegraa-Setup-1.0.0.exe` - Windows installer
- `dist/Kinntegraa-1.0.0-portable.exe` - Portable version (no install needed)

### 4. Build for Other Platforms

```bash
# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux

# Build for all platforms
npm run build
```

## Development Mode

To test locally before building:

```bash
# Start in development mode (connects to localhost:3000)
NODE_ENV=development npm start
```

## Installation on Windows

1. Download `Kinntegraa-Setup-1.0.0.exe`
2. Run the installer
3. Choose installation directory
4. Desktop shortcut will be created automatically
5. Launch from Start Menu or Desktop

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+R | Refresh page |
| Ctrl+Q | Quit application |
| Ctrl++ | Zoom in |
| Ctrl+- | Zoom out |
| Ctrl+0 | Reset zoom |
| F11 | Toggle fullscreen |
| F12 | Developer tools |

## System Tray

When you close the window, the app minimizes to the system tray.
- **Double-click** tray icon to restore window
- **Right-click** for quick menu

## Customization

### Change App Icon

Replace `icon.png` with your own 512x512 PNG image.

### Change App Name

Edit `package.json`:
```json
{
  "name": "your-app-name",
  "productName": "Your App Name"
}
```

## Troubleshooting

### App won't start
- Ensure you have the correct `APP_URL` set
- Check internet connection
- Try running as administrator

### Build fails
- Delete `node_modules` and run `npm install` again
- Ensure Node.js v18+ is installed
- On Windows, install Windows Build Tools: `npm install -g windows-build-tools`

## Support

For issues, contact support@kinntegraa.com
