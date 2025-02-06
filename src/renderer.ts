// Use the provided electron API directly
const { ipcRenderer } = require('electron');

interface Tab {
	id: string;
	url: string;
	title: string;
	webview: Electron.WebviewTag;
	element: HTMLDivElement;
	favicon: string;
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
	private sidebarVisible = true;
	private sidebar: HTMLElement;
	private toast: HTMLElement;
	private toastMessage: HTMLElement;
	private toastTimeout: NodeJS.Timeout | null = null;
	private loadingBar: HTMLElement;
	private loadingTimeout: NodeJS.Timeout | null = null;

	constructor() {
		console.log('Browser class initializing...'); // Debug
		this.tabsContainer = document.getElementById('tabs-container') as HTMLElement;
		this.webviewContainer = document.getElementById('webview-container') as HTMLElement;
		this.urlInput = document.getElementById('url-input') as HTMLInputElement;
		this.sidebar = document.getElementById('sidebar') as HTMLElement;
		this.toast = document.getElementById('toast') as HTMLElement;
		this.toastMessage = document.getElementById('toast-message') as HTMLElement;
		this.loadingBar = document.getElementById('loading-bar') as HTMLElement;

		console.log('DOM elements found:', { // Debug
			tabsContainer: !!this.tabsContainer,
			webviewContainer: !!this.webviewContainer,
			urlInput: !!this.urlInput,
			sidebar: !!this.sidebar,
			toast: !!this.toast,
			toastMessage: !!this.toastMessage,
			loadingBar: !!this.loadingBar
		});

		this.setupEventListeners();
		this.createNewTab('https://www.google.com');

		// Add keyboard shortcut handlers
		ipcRenderer.on('close-active-tab', () => {
			if (this.activeTabId) {
				this.closeTab(this.activeTabId);
			}
		});

		ipcRenderer.on('toggle-sidebar', () => {
			this.toggleSidebar();
		});

		ipcRenderer.on('new-tab', () => {
			this.createNewTab('https://www.google.com');
		});

		// Add copy URL handler
		ipcRenderer.on('copy-current-url', () => {
			this.copyCurrentUrl();
		});

		// Add refresh handler
		ipcRenderer.on('refresh-tab', () => {
			this.refreshCurrentTab();
		});
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

		// Create favicon image
		const faviconImg = document.createElement('img');
		faviconImg.className = 'tab-favicon';
		faviconImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // Transparent placeholder
		tabElement.appendChild(faviconImg);

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

		// Create webview with extension support
		const webview = document.createElement('webview') as Electron.WebviewTag;
		webview.setAttribute('autosize', 'on');
		webview.setAttribute('nodeintegration', 'on');
		webview.setAttribute('webpreferences', 'contextIsolation=false, plugins=true, webSecurity=true, autoplayPolicy=no-user-gesture-required');
		webview.setAttribute('partition', 'persist:webview');
		webview.setAttribute('allowpopups', 'on');

		// Add error handling for webview
		webview.addEventListener('did-fail-load', (e) => {
			console.error('Failed to load:', e);
			if (e.errorCode === -3) { // ERR_ABORTED
				console.log('Retrying load after abort...');
				setTimeout(() => {
					webview.reload();
				}, 100);
			}
		});

		webview.addEventListener('crashed', (e) => {
			console.error('Webview crashed:', e);
			this.showToast('Page crashed. Reloading...');
			setTimeout(() => {
				webview.reload();
			}, 1000);
		});

		// Enable Chrome extension APIs
		webview.setAttribute('preload', `
			window.chrome = chrome;
			window.browser = chrome;
		`);

		// Add error handling for webview
		webview.addEventListener('dom-ready', () => {
			console.log(`Webview DOM ready for tab ${tabId}`);
		});

		webview.addEventListener('console-message', (e) => {
			console.log('Webview console:', e.message);
		});

		// Set source URL after adding event listeners
		webview.src = url;

		// Add elements to DOM
		this.tabsContainer.appendChild(tabElement);
		this.webviewContainer.appendChild(webview);

		// Setup webview events
		webview.addEventListener('did-start-loading', () => {
			console.log('Webview started loading'); // Debug
			this.startLoading();
		});

		webview.addEventListener('did-finish-load', () => {
			console.log('Webview finished loading'); // Debug
			this.finishLoading();
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

		// Add page-favicon-updated event listener
		webview.addEventListener('page-favicon-updated', (e) => {
			const tab = this.tabs.get(tabId);
			if (tab && e.favicons && e.favicons.length > 0) {
				tab.favicon = e.favicons[0];
				const faviconImg = tab.element.querySelector('.tab-favicon') as HTMLImageElement;
				if (faviconImg) {
					faviconImg.src = e.favicons[0];
				}
			}
		});

		// Store tab data
		const tab: Tab = {
			id: tabId,
			url,
			title: 'Loading...',
			webview,
			element: tabElement,
			favicon: ''
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
			this.updateUrlDisplay();
		}
	}

	private startLoading() {
		// Clear any existing timeouts
		if (this.loadingTimeout) {
			clearTimeout(this.loadingTimeout);
			this.loadingTimeout = null;
		}

		// Reset the loading bar
		this.loadingBar.classList.remove('finished');
		this.loadingBar.classList.remove('loading');
		this.loadingBar.style.width = '0';
		this.loadingBar.style.opacity = '0';
		this.loadingBar.offsetHeight; // Force reflow

		// Start loading animation
		requestAnimationFrame(() => {
			this.loadingBar.classList.add('loading');
		});
	}

	private finishLoading() {
		// Complete the loading animation
		this.loadingBar.classList.remove('loading');
		this.loadingBar.classList.add('finished');

		// Clean up after animation
		this.loadingTimeout = setTimeout(() => {
			this.loadingBar.classList.remove('finished');
			this.loadingBar.style.width = '0';
			this.loadingBar.style.opacity = '0';
			this.loadingTimeout = null;
		}, 700); // Reduced cleanup time to match new animation speed
	}

	private navigateTab(tabId: string, url: string) {
		const tab = this.tabs.get(tabId);
		if (tab) {
			const loadUrl = () => {
				try {
					this.startLoading();
					tab.webview.loadURL(url);
					tab.url = this.formatUrl(url);
					console.log('URL loaded successfully:', url); // Debug
				} catch (error) {
					console.error('Error loading URL:', error); // Debug
					this.finishLoading();
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

			this.updateUrlDisplay();
		}
	}

	private formatUrl(url: string): string {
		if (!/^https?:\/\//i.test(url)) {
			return `https://${url}`;
		}
		return url;
	}

	private toggleSidebar() {
		this.sidebarVisible = !this.sidebarVisible;
		if (this.sidebarVisible) {
			this.sidebar.style.display = 'flex';
			ipcRenderer.send('set-traffic-lights-visibility', true);
		} else {
			this.sidebar.style.display = 'none';
			ipcRenderer.send('set-traffic-lights-visibility', false);
		}
	}

	private closeTab(tabId: string) {
		const tab = this.tabs.get(tabId);
		if (!tab) return;

		// Remove DOM elements
		tab.element.remove();
		tab.webview.remove();

		// Remove from tabs collection
		this.tabs.delete(tabId);

		// If this was the active tab, activate another tab
		if (this.activeTabId === tabId) {
			this.activeTabId = null;
			// Find the last tab to activate
			const lastTab = Array.from(this.tabs.keys()).pop();
			if (lastTab) {
				this.activateTab(lastTab);
			}
		}

		// If no tabs left, create a new one
		if (this.tabs.size === 0) {
			this.createNewTab('https://www.google.com');
		}
	}

	private copyCurrentUrl() {
		if (this.activeTabId) {
			const tab = this.tabs.get(this.activeTabId);
			if (tab) {
				// Focus the window first
				window.focus();

				// Small delay to ensure focus is complete
				setTimeout(() => {
					navigator.clipboard.writeText(tab.url)
						.then(() => {
							this.showToast('URL copied to clipboard');
						})
						.catch(err => {
							console.error('Failed to copy URL:', err);
							this.showToast('Failed to copy URL');
						});
				}, 100);
			}
		}
	}

	private showToast(message: string) {
		// Clear any existing timeout
		if (this.toastTimeout) {
			clearTimeout(this.toastTimeout);
		}

		// Update message and show toast
		this.toastMessage.textContent = message;
		this.toast.classList.add('show');

		// Hide toast after 3 seconds
		this.toastTimeout = setTimeout(() => {
			this.toast.classList.remove('show');
		}, 3000);
	}

	private updateUrlDisplay() {
		if (!this.activeTabId) return;

		const tab = this.tabs.get(this.activeTabId);
		if (!tab) return;
	}

	private refreshCurrentTab() {
		if (this.activeTabId) {
			const tab = this.tabs.get(this.activeTabId);
			if (tab) {
				this.startLoading();
				tab.webview.reload();
			}
		}
	}
}

// Initialize the browser when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	new Browser();
}); 