# ComputeGrid Worker Desktop App

A one-click desktop application for contributing computing power to the ComputeGrid network.

## Features

- **Easy Setup**: Just enter your API key and click Start
- **System Tray**: Runs quietly in the background with quick access controls
- **Auto-Start**: Optionally start earning when your computer boots
- **Ollama Integration**: Automatic AI model management for inference tasks
- **Real-time Stats**: See your earnings and completed tasks at a glance

## Installation

### Pre-built Installers

Download the installer for your platform:
- **Windows**: `ComputeGrid-Worker-Setup.exe`
- **macOS**: `ComputeGrid-Worker.dmg`
- **Linux**: `ComputeGrid-Worker.AppImage`

### Building from Source

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm start
   ```

3. Build installers:
   ```bash
   npm run build        # All platforms
   npm run build:win    # Windows only
   npm run build:mac    # macOS only
   npm run build:linux  # Linux only
   ```

## Configuration

1. Get your API key from the ComputeGrid dashboard
2. Enter your server URL and API key in the app
3. Click "Start Worker" to begin earning

## System Requirements

- **OS**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **RAM**: 4GB minimum, 8GB+ recommended for AI tasks
- **Storage**: 10GB free space for AI models
- **Network**: Stable internet connection

## Ollama Setup

The app will automatically:
1. Detect if Ollama is installed
2. Prompt you to install it if needed
3. Download appropriate AI models based on your RAM

For manual Ollama installation:
- **Linux**: `curl -fsSL https://ollama.com/install.sh | sh`
- **Windows/macOS**: Download from https://ollama.com

## Troubleshooting

### Worker not connecting
- Check your API key is correct
- Verify the server URL is accessible
- Ensure your firewall allows outbound connections

### Ollama not working
- Make sure Ollama is running: `ollama serve`
- Check if a model is installed: `ollama list`
- Pull a model manually: `ollama pull mistral`

## License

MIT License - See LICENSE file for details.
