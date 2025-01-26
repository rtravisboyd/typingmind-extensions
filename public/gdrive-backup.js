// TypingMind Google Drive Backup Extension
(() => {
    // First, inject Google API client library
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
        // Load auth2 library
        window.gapi.load('client:auth2', initializeExtension);
    };
    document.head.appendChild(script);

    const CONFIG = {
        FOLDER_NAME: 'TypingMind Backup & Cloud Sync',
        BACKUP_FREQUENCY: 24 * 60 * 60 * 1000,
        KEEP_BACKUPS: 7,
        DEBUG: true
    };

    let folderId = null;
    let isInitialized = false;
    let lastBackupTime = null;

    const log = (message, type = 'info') => {
        if (CONFIG.DEBUG) {
            console[type](`[TypingMind Backup] ${message}`);
        }
    };

    const createStatusElement = () => {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'tm-backup-status';
        statusDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #f0f0f0;
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 9999;
            font-size: 12px;
        `;
        document.body.appendChild(statusDiv);
        return statusDiv;
    };

    const updateStatus = (message, type = 'info') => {
        const statusDiv = document.getElementById('tm-backup-status') || createStatusElement();
        statusDiv.textContent = message;
        statusDiv.style.background = type === 'error' ? '#ffe6e6' : '#f0f0f0';
        log(message, type);
    };

    async function initializeExtension() {
        try {
            await window.gapi.client.init({
                apiKey: 'AIzaSyBy0N2UWH2hZiFQUFeSS_6JE-9Tj8IJnIw',
                clientId: '753342971428-ock50rvg2d0rf6h4e67lb2ssvkvqpq2n.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/drive.file',
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
            });

            const authInstance = window.gapi.auth2.getAuthInstance();
            if (!authInstance.isSignedIn.get()) {
                await authInstance.signIn();
            }

            await initializeDrive();
        } catch (error) {
            updateStatus(`Initialization failed: ${error.message}`, 'error');
        }
    }
    async function initializeDrive() {
        try {
            const response = await window.gapi.client.drive.files.list({
                q: `name='${CONFIG.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)'
            });

            if (response.result.files.length > 0) {
                folderId = response.result.files[0].id;
            } else {
                const folderResponse = await window.gapi.client.drive.files.create({
                    resource: {
                        name: CONFIG.FOLDER_NAME,
                        mimeType: 'application/vnd.google-apps.folder'
                    },
                    fields: 'id'
                });
                folderId = folderResponse.result.id;
            }

            isInitialized = true;
            updateStatus('Ready to backup');
            createBackupButton();
        } catch (error) {
            updateStatus(`Drive initialization failed: ${error.message}`, 'error');
        }
    }

    function createBackupButton() {
        const sidebar = document.querySelector('.sidebar-menu');
        if (!sidebar || document.getElementById('gdrive-backup-btn')) return;

        const button = document.createElement('div');
        button.id = 'gdrive-backup-btn';
        button.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
            margin: 4px 0;
        `;
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style="font-size: 12px; margin-top: 4px;">Backup</span>
        `;

        button.onmouseover = () => button.style.opacity = '1';
        button.onmouseout = () => button.style.opacity = '0.7';
        button.onclick = createBackup;

        const settingsButton = sidebar.querySelector('[class*="Settings"]');
        if (settingsButton) {
            sidebar.insertBefore(button, settingsButton);
        } else {
            sidebar.appendChild(button);
        }
    }

    async function createBackup() {
        if (!isInitialized || !folderId) {
            updateStatus('System not initialized', 'error');
            return;
        }

        try {
            updateStatus('Creating backup...');
            const chats = Object.entries(localStorage)
                .filter(([key]) => key.startsWith('chat:'))
                .map(([_, value]) => JSON.parse(value));

            const backupData = JSON.stringify({
                timestamp: new Date().toISOString(),
                chats: chats,
                version: '1.0'
            });

            const file = await window.gapi.client.drive.files.create({
                resource: {
                    name: `TypingMind_Backup_${new Date().toISOString().replace(/:/g, '-')}.json`,
                    parents: [folderId]
                },
                media: {
                    mimeType: 'application/json',
                    body: backupData
                },
                fields: 'id, name'
            });

            lastBackupTime = new Date();
            updateStatus(`Backup completed: ${file.result.name}`);
            await cleanupOldBackups();
        } catch (error) {
            updateStatus(`Backup failed: ${error.message}`, 'error');
        }
    }

    async function cleanupOldBackups() {
        try {
            const response = await window.gapi.client.drive.files.list({
                q: `'${folderId}' in parents and mimeType='application/json'`,
                orderBy: 'createdTime desc',
                fields: 'files(id, name, createdTime)'
            });

            const files = response.result.files;
            if (files.length > CONFIG.KEEP_BACKUPS) {
                for (let i = CONFIG.KEEP_BACKUPS; i < files.length; i++) {
                    await window.gapi.client.drive.files.delete({
                        fileId: files[i].id
                    });
                }
            }
        } catch (error) {
            log(`Cleanup failed: ${error.message}`, 'error');
        }
    }
})();
