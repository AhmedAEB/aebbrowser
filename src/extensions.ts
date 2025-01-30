import { ipcRenderer } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export class ExtensionManager {
    private extensionsPath: string | null = null;

    async initialize() {
        this.extensionsPath = await ipcRenderer.invoke('get-extensions-path');
        await this.ensureExtensionDirectory();
    }

    private async ensureExtensionDirectory() {
        if (!this.extensionsPath) return;
        
        if (!fs.existsSync(this.extensionsPath)) {
            fs.mkdirSync(this.extensionsPath, { recursive: true });
        }
    }

    async loadExtension(extensionPath: string) {
        try {
            const result = await ipcRenderer.invoke('load-extension', extensionPath);
            if (result.success) {
                console.log('Extension loaded successfully:', result.extension);
                return true;
            } else {
                console.error('Failed to load extension:', result.error);
                return false;
            }
        } catch (error) {
            console.error('Error loading extension:', error);
            return false;
        }
    }

    getExtensionsPath() {
        return this.extensionsPath;
    }
} 