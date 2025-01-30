// Use the provided electron API directly
const { ipcRenderer } = require('electron');

interface Tab {
	id: string;
	url: string;
	title: string;
	webview: Electron.WebviewTag;
	element: HTMLDivElement;
}

// Add IPC event types
interface IpcRendererEvent {
	sender: Electron.IpcRenderer;
	senderId: number;
}

class Browser {
	private tabs: Map<string, Tab> = new Map();
	private activeTabId: string | null = null;
	private tabsContainer: HTMLElement;
	private webviewContainer: HTMLElement;
	private urlInput: HTMLInputElement;

	constructor() {
		console.log('Browser class initializing...'); // Debug
		this.tabsContainer = document.getElementById('tabs-container') as HTMLElement;
		this.webviewContainer = document.getElementById('webview-container') as HTMLElement;
		this.urlInput = document.getElementById('url-input') as HTMLInputElement;

		console.log('DOM elements found:', { // Debug
			tabsContainer: !!this.tabsContainer,
			webviewContainer: !!this.webviewContainer,
			urlInput: !!this.urlInput
		});

		this.setupEventListeners();
		this.createNewTab('https://www.google.com');
	}

	private setupEventListeners() {
		// New tab button
		const newTabBtn = document.getElementById('new-tab-btn');
		if (newTabBtn) {
			newTabBtn.addEventListener('click', () => this.createNewTab('https://www.google.com'));
		}

		// URL input - handle navigation directly
		this.urlInput.addEventListener('keypress', (e) => {
			console.log('Keypress event:', e.key); // Debug
			if (e.key === 'Enter') {
				const url = this.formatUrl(this.urlInput.value);
				console.log('Formatted URL:', url); // Debug
				if (this.activeTabId) {
					console.log('Active tab ID:', this.activeTabId); // Debug
					const tab = this.tabs.get(this.activeTabId);
					if (tab) {
						console.log('Found tab, attempting to load URL'); // Debug
						this.navigateTab(this.activeTabId, url);
					} else {
						console.log('No tab found for ID:', this.activeTabId); // Debug
					}
				} else {
					console.log('No active tab ID'); // Debug
				}
			}
		});

		// IPC events with proper typing
		ipcRenderer.on('create-new-tab', (_event: IpcRendererEvent, url: string) => {
			this.createNewTab(url);
		});

		ipcRenderer.on('update-tab', (_event: IpcRendererEvent, { tabId, url }: { tabId: string, url: string }) => {
			this.navigateTab(tabId, url);
		});
	}

	private createNewTab(url: string) {
		console.log('Creating new tab with URL:', url); // Debug
		const tabId = `tab-${Date.now()}`;

		// Create tab element
		const tabElement = document.createElement('div');
		tabElement.className = 'tab';
		
		// Create title span
		const titleSpan = document.createElement('span');
		titleSpan.textContent = 'Loading...';
		tabElement.appendChild(titleSpan);
		
		// Create close button
		const closeButton = document.createElement('div');
		closeButton.className = 'tab-close';
		closeButton.innerHTML = '×';
		closeButton.addEventListener('click', (e) => {
			e.stopPropagation(); // Prevent tab activation when closing
			this.closeTab(tabId);
		});
		tabElement.appendChild(closeButton);
		
		tabElement.addEventListener('click', () => this.activateTab(tabId));

		// Create webview with error handling
		const webview = document.createElement('webview') as Electron.WebviewTag;
		webview.setAttribute('autosize', 'on');
		webview.setAttribute('nodeintegration', 'on');
		webview.setAttribute('webpreferences', 'contextIsolation=false');
		
		// Add error handling for webview
		webview.addEventListener('dom-ready', () => {
			console.log(`Webview DOM ready for tab ${tabId}`);
		});

		webview.addEventListener('console-message', (e) => {
			console.log('Webview console:', e.message);
		});

		webview.addEventListener('did-fail-load', (e) => {
			console.error('Failed to load:', e.errorDescription);
			titleSpan.textContent = 'Failed to load';
		});

		// Set source URL after adding event listeners
		webview.src = url;

		// Add elements to DOM
		this.tabsContainer.appendChild(tabElement);
		this.webviewContainer.appendChild(webview);

		// Add loading indicator
		const loadingIndicator = document.createElement('div');
		loadingIndicator.className = 'loading-indicator';
		loadingIndicator.textContent = 'Loading...';
		tabElement.appendChild(loadingIndicator);

		webview.addEventListener('did-start-loading', () => {
			loadingIndicator.style.display = 'block';
		});

		webview.addEventListener('did-finish-load', () => {
			loadingIndicator.style.display = 'none';
		});

		// Setup webview events
		webview.addEventListener('did-start-loading', () => {
			console.log('Webview started loading'); // Debug
		});

		webview.addEventListener('did-finish-load', () => {
			console.log('Webview finished loading'); // Debug
		});

		webview.addEventListener('page-title-updated', (e) => {
			const tab = this.tabs.get(tabId);
			if (tab) {
				tab.title = e.title;
				titleSpan.textContent = e.title;
			}
		});

		webview.addEventListener('did-navigate', (e) => {
			const tab = this.tabs.get(tabId);
			if (tab) {
				tab.url = e.url;
				if (this.activeTabId === tabId) {
					this.urlInput.value = e.url;
				}
			}
		});

		// Store tab data
		const tab: Tab = {
			id: tabId,
			url,
			title: 'Loading...',
			webview,
			element: tabElement
		};
		this.tabs.set(tabId, tab);

		// Activate the new tab
		this.activateTab(tabId);
	}

	private activateTab(tabId: string) {
		// Deactivate current tab
		if (this.activeTabId) {
			const currentTab = this.tabs.get(this.activeTabId);
			if (currentTab) {
				currentTab.element.classList.remove('active');
				currentTab.webview.classList.remove('active');
			}
		}

		// Activate new tab
		const newTab = this.tabs.get(tabId);
		if (newTab) {
			this.activeTabId = tabId;
			newTab.element.classList.add('active');
			newTab.webview.classList.add('active');
			this.urlInput.value = newTab.url;
		}
	}

	private navigateTab(tabId: string, url: string) {
		const tab = this.tabs.get(tabId);
		if (tab) {
			const loadUrl = () => {
				try {
					tab.webview.loadURL(url);
					tab.url = url;
					console.log('URL loaded successfully:', url); // Debug
				} catch (error) {
					console.error('Error loading URL:', error); // Debug
				}
			};

			try {
				// Try to load URL directly
				loadUrl();
			} catch {
				// If it fails, wait for dom-ready
				const loadUrlOnReady = () => {
					loadUrl();
					tab.webview.removeEventListener('dom-ready', loadUrlOnReady);
				};
				tab.webview.addEventListener('dom-ready', loadUrlOnReady);
			}
		}
	}

	private formatUrl(url: string): string {
		if (!/^https?:\/\//i.test(url)) {
			return `https://${url}`;
		}
		return url;
	}

	private closeTab(tabId: string) {
		const tab = this.tabs.get(tabId);
		if (!tab) return;

		// Remove DOM elements
		tab.element.remove();
		tab.webview.remove();

		// Remove from tabs map
		this.tabs.delete(tabId);

		// If this was the active tab, activate another tab
		if (this.activeTabId === tabId) {
			this.activeTabId = null;
			
			// Find the last tab to activate
			const remainingTabs = Array.from(this.tabs.keys());
			if (remainingTabs.length > 0) {
				this.activateTab(remainingTabs[remainingTabs.length - 1]);
			}
		}

		// If no tabs left, create a new one
		if (this.tabs.size === 0) {
			this.createNewTab('https://www.google.com');
		}
	}
}

// Initialize the browser when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	new Browser();
}); 