import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
const { BrowserWindow, app, ipcMain, globalShortcut } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: electron.BrowserWindow | null = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			webviewTag: true,
			webSecurity: true,
			sandbox: false,
		}
	});

	mainWindow?.loadFile(path.join(__dirname, '../src/index.html'));

	// Always open DevTools for debugging
	mainWindow?.webContents.openDevTools();

	// Register keyboard shortcuts
	globalShortcut.register('CommandOrControl+W', () => {
		mainWindow?.webContents.send('close-active-tab');
	});

	globalShortcut.register('CommandOrControl+S', () => {
		mainWindow?.webContents.send('toggle-sidebar');
	});

	mainWindow?.on('closed', () => {
		// Unregister shortcuts when window is closed
		globalShortcut.unregisterAll();
		mainWindow = null;
	});
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow();
	}
});

// Handle new tab creation
ipcMain.on('new-tab', (event, url: string) => {
	if (mainWindow) {
		event.reply('create-new-tab', url);
	}
});

// Handle tab navigation
ipcMain.on('navigate', (event, { tabId, url }: { tabId: string, url: string }) => {
	if (mainWindow) {
		// Add URL protocol if missing
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = `https://${url}`;
		}
		event.reply('update-tab', { tabId, url });
	}
}); 