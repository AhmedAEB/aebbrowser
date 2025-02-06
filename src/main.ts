import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron, { session } from 'electron';
const { BrowserWindow, app, ipcMain, globalShortcut } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: electron.BrowserWindow | null = null;

async function loadExtensions() {
	try {
		// Path to your extensions directory (you can change this)
		const extensionsPath = path.join(app.getPath('userData'), 'extensions');

		// Enable loading extensions
		await session.defaultSession.loadExtension(extensionsPath, {
			allowFileAccess: true
		});

		console.log('Extensions loaded successfully');
	} catch (err) {
		console.error('Failed to load extensions:', err);
	}
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		frame: false,
		titleBarStyle: 'hiddenInset',
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			webviewTag: true,
			webSecurity: true,
			sandbox: false,
			plugins: true,
			experimentalFeatures: true,
		}
	});

	// Configure session for webview
	const webviewSession = session.fromPartition('persist:webview');

	// Configure content security policy
	webviewSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: *"]
			}
		});
	});

	// Configure session permissions for media
	webviewSession.setPermissionRequestHandler((_webContents, permission, callback) => {
		if (permission === 'media' || permission === 'fullscreen') {
			callback(true);
			return;
		}
		callback(true);
	});

	// Configure session to handle media autoplay
	webviewSession.setPermissionCheckHandler((_webContents, permission) => {
		if (permission === 'media' || permission === 'fullscreen') {
			return true;
		}
		return true;
	});

	mainWindow?.loadFile(path.join(__dirname, '../src/index.html'));

	// Register keyboard shortcuts
	globalShortcut.register('CommandOrControl+W', () => {
		mainWindow?.webContents.send('close-active-tab');
	});

	globalShortcut.register('CommandOrControl+S', () => {
		mainWindow?.webContents.send('toggle-sidebar');
	});

	// Add new shortcut for new tab
	globalShortcut.register('CommandOrControl+T', () => {
		mainWindow?.webContents.send('new-tab');
	});

	// Add URL copy shortcut
	globalShortcut.register('CommandOrControl+Shift+C', () => {
		mainWindow?.webContents.send('copy-current-url');
	});

	mainWindow?.on('closed', () => {
		// Unregister shortcuts when window is closed
		globalShortcut.unregisterAll();
		mainWindow = null;
	});
}

app.whenReady().then(async () => {
	await loadExtensions();
	createWindow();
});

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

// Add these IPC handlers for extension management
ipcMain.handle('get-extensions-path', () => {
	return path.join(app.getPath('userData'), 'extensions');
});

ipcMain.handle('load-extension', async (_event, extensionPath: string) => {
	try {
		const extension = await session.defaultSession.loadExtension(extensionPath);
		return { success: true, extension };
	} catch (error) {
		return { success: false, error: (error as Error).message };
	}
}); 