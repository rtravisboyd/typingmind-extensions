// TypingMind Google Drive Backup Extension
(() => {
    const CONFIG = {
        FOLDER_NAME: 'TypingMind Backup & Cloud Sync',
        BACKUP_FREQUENCY: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        KEEP_BACKUPS: 7, // Number of backups to keep
        DEBUG: true // Set to false in production
    };

    let folderId = null;
    let isInitialized = false;
    let lastBackupTime = null;

    // Utility functions
    const log = (message, type = 'info') => {
        if (CONFIG.DEBUG) {
            console[type](`[TypingMind Backup] ${message}`);
        }
    };

    // UI Elements
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

    // OAuth Configuration
    const OAUTH_CONFIG = {
        apiKey: 'AIzaSyBy0N2UWH2hZiFQUFeSS_6JE-9Tj8IJnIw',
        clientId: '753342971428-ock50rvg2d0rf6h4e67lb2ssvkvqpq2n.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file',
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    };

    // Load Google API
    const loadGoogleAPI = () => {
        return new Promise((resolve, reject) => {
            window.gapi.load('client:auth2', {
                callback: resolve,
                onerror: reject,
                timeout: 5000,
                ontimeout: reject
            });
        });
    };

    // Initialize Google API
    const initializeGoogleAPI = async () => {
        try {
            updateStatus('Initializing Google API...');
            await window.gapi.client.init(OAUTH_CONFIG);
            updateStatus('Google API initialized');
            return true;
        } catch (error) {
            updateStatus(`Failed to initialize Google API: ${error.message}`, 'error');
            return false;
        }
    };

    // Handle Authentication
    const authenticateWithGoogle = async () => {
        try {
            updateStatus('Checking authentication...');
            const authInstance = window.gapi.auth2.getAuthInstance();
            
            if (!authInstance.isSignedIn.get()) {
                updateStatus('Please sign in to Google Drive...');
                await authInstance.signIn();
            }
            
            updateStatus('Successfully authenticated');
            return true;
        } catch (error) {
            updateStatus(`Authentication failed: ${error.message}`, 'error');
            return false;
        }
    };
    // Drive Operations
    const createOrGetFolder = async () => {
        try {
            const response = await window.gapi.client.drive.files.list({
                q: `name='${CONFIG.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)'
            });

            if (response.result.files.length > 0) {
                folderId = response.result.files[0].id;
                log(`Found existing folder: ${folderId}`);
            } else {
                const folderMetadata = {
                    name: CONFIG.FOLDER_NAME,
                    mimeType: 'application/vnd.google-apps.folder'
                };

                const folder = await window.gapi.client.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id'
                });

                folderId = folder.result.id;
                log(`Created new folder: ${folderId}`);
            }
            return folderId;
        } catch (error) {
            updateStatus(`Folder operation failed: ${error.message}`, 'error');
            return null;
        }
    };

    const createBackup = async () => {
        if (!folderId) {
            updateStatus('Backup folder not initialized', 'error');
            return false;
        }

        try {
            updateStatus('Creating backup...');
            const chats = window.typingMind.getChats();
            const backupData = JSON.stringify({
                timestamp: new Date().toISOString(),
                chats: chats,
                version: '1.0'
            });

            const fileMetadata = {
                name: `TypingMind_Backup_${new Date().toISOString()}.json`,
                parents: [folderId]
            };

            const file = await window.gapi.client.drive.files.create({
                resource: fileMetadata,
                media: {
                    mimeType: 'application/json',
                    body: backupData
                },
                fields: 'id, name, createdTime'
            });

            lastBackupTime = new Date();
            updateStatus(`Backup completed: ${file.result.name}`);
            await cleanupOldBackups();
            return true;
        } catch (error) {
            updateStatus(`Backup failed: ${error.message}`, 'error');
            return false;
        }
    };

    const cleanupOldBackups = async () => {
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
                    log(`Deleted old backup: ${files[i].name}`);
                }
            }
        } catch (error) {
            log(`Cleanup failed: ${error.message}`, 'error');
        }
    };

    // Main initialization
    const initialize = async () => {
        try {
            updateStatus('Starting initialization...');
            
            // Wait for Google API to be available
            if (!window.gapi) {
                throw new Error('Google API not loaded');
            }

            // Load and initialize Google API
            await loadGoogleAPI();
            const initialized = await initializeGoogleAPI();
            if (!initialized) {
                throw new Error('Failed to initialize Google API');
            }

            // Authenticate
            const authenticated = await authenticateWithGoogle();
            if (!authenticated) {
                throw new Error('Authentication failed');
            }

            // Set up Drive
            const folder = await createOrGetFolder();
            if (!folder) {
                throw new Error('Failed to access backup folder');
            }

            // Schedule backups
            setInterval(async () => {
                const now = new Date();
                if (!lastBackupTime || (now - lastBackupTime) >= CONFIG.BACKUP_FREQUENCY) {
                    await createBackup();
                }
            }, 60 * 60 * 1000); // Check every hour

            // Initial backup
            await createBackup();
            isInitialized = true;
            updateStatus('Backup system initialized successfully');
        } catch (error) {
            updateStatus(`Initialization failed: ${error.message}`, 'error');
            console.error('Full error details:', error);
        }
    };

    // Start the extension when Google API is ready
    if (window.gapi) {
        initialize();
    } else {
        updateStatus('Waiting for Google API...', 'error');
    }
})();
