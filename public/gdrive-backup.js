// Load Google API Client Library
const script = document.createElement('script');
script.src = 'https://apis.google.com/js/api.js';
script.onload = () => {
    // TypingMind Google Drive Backup Extension
    (function() {
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

        // Google Drive Operations
        const initGoogleDriveAPI = async () => {
            try {
                updateStatus('Starting Google Drive API initialization...');
                
                // Load only the client first
                updateStatus('Loading client library...');
                await gapi.client.init({
                    apiKey: 'AIzaSyBy0N2UWH2hZiFQUFeSS_6JE-9Tj8IJnIw',
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                });
                updateStatus('Client library loaded');

                // Then initialize auth separately
                updateStatus('Loading auth library...');
                await gapi.client.init({
                    clientId: '753342971428-ock50rvg2d0rf6h4e67lb2ssvkvqpq2n.apps.googleusercontent.com',
                    scope: 'https://www.googleapis.com/auth/drive.file'
                });
                updateStatus('Auth library loaded');
                
                isInitialized = true;
                log('Google Drive API initialized successfully');
                return true;
            } catch (error) {
                updateStatus(`Google Drive API initialization error: ${error.message}`, 'error');
                console.error('Full Google Drive API error:', error);
                log(error, 'error');
                return false;
            }
        };
        const createOrGetFolder = async () => {
            try {
                // Search for existing folder
                const response = await gapi.client.drive.files.list({
                    q: `name='${CONFIG.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    fields: 'files(id, name)'
                });

                if (response.result.files.length > 0) {
                    folderId = response.result.files[0].id;
                    log(`Found existing folder: ${folderId}`);
                } else {
                    // Create new folder
                    const folderMetadata = {
                        name: CONFIG.FOLDER_NAME,
                        mimeType: 'application/vnd.google-apps.folder'
                    };

                    const folder = await gapi.client.drive.files.create({
                        resource: folderMetadata,
                        fields: 'id'
                    });

                    folderId = folder.result.id;
                    log(`Created new folder: ${folderId}`);
                }
                return folderId;
            } catch (error) {
                updateStatus('Failed to create/get folder', 'error');
                log(error, 'error');
                return null;
            }
        };

        // Backup Operations
        const createBackup = async () => {
            if (!isInitialized || !folderId) {
                updateStatus('Backup system not initialized', 'error');
                return false;
            }

            try {
                updateStatus('Creating backup...');
                
                // Get chat data from TypingMind
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

                const file = await gapi.client.drive.files.create({
                    resource: fileMetadata,
                    media: {
                        mimeType: 'application/json',
                        body: backupData
                    },
                    fields: 'id, name, createdTime'
                });

                lastBackupTime = new Date();
                updateStatus(`Backup completed: ${file.result.name}`);
                
                // Clean up old backups
                await cleanupOldBackups();
                return true;
            } catch (error) {
                updateStatus('Backup failed', 'error');
                log(error, 'error');
                return false;
            }
        };

        const cleanupOldBackups = async () => {
            try {
                const response = await gapi.client.drive.files.list({
                    q: `'${folderId}' in parents and mimeType='application/json'`,
                    orderBy: 'createdTime desc',
                    fields: 'files(id, name, createdTime)'
                });

                const files = response.result.files;
                if (files.length > CONFIG.KEEP_BACKUPS) {
                    for (let i = CONFIG.KEEP_BACKUPS; i < files.length; i++) {
                        await gapi.client.drive.files.delete({
                            fileId: files[i].id
                        });
                        log(`Deleted old backup: ${files[i].name}`);
                    }
                }
            } catch (error) {
                log('Failed to cleanup old backups', 'error');
                log(error, 'error');
            }
        };

        // Restore Operations
        const restoreFromBackup = async () => {
            try {
                updateStatus('Loading available backups...');
                
                const response = await gapi.client.drive.files.list({
                    q: `'${folderId}' in parents and mimeType='application/json'`,
                    orderBy: 'createdTime desc',
                    fields: 'files(id, name, createdTime)'
                });

                const files = response.result.files;
                if (files.length === 0) {
                    updateStatus('No backups found', 'error');
                    return false;
                }

                // Get the most recent backup
                const mostRecent = files[0];
                const file = await gapi.client.drive.files.get({
                    fileId: mostRecent.id,
                    alt: 'media'
                });

                const backupData = JSON.parse(file.body);
                
                // Restore to TypingMind
                window.typingMind.restoreChats(backupData.chats);
                
                updateStatus(`Restored from backup: ${mostRecent.name}`);
                return true;
            } catch (error) {
                updateStatus('Restore failed', 'error');
                log(error, 'error');
                return false;
            }
        };

        // Initialization and Scheduling
        const initialize = async () => {
            try {
                updateStatus('Starting initialization...');
                
                // Load the Google API client and auth2 library
                updateStatus('Loading Google API...');
                try {
                    await new Promise((resolve, reject) => {
                        gapi.load('client:auth2', {
                            callback: resolve,
                            onerror: reject
                        });
                    });
                    updateStatus('Google API loaded successfully');
                } catch (loadError) {
                    throw new Error(`Failed to load Google API: ${loadError.message}`);
                }

                // Initialize the API
                updateStatus('Initializing Google Drive API...');
                const initialized = await initGoogleDriveAPI();
                if (!initialized) {
                    throw new Error('Failed to initialize Google Drive API');
                }
                updateStatus('Google Drive API initialized');

                // Handle authentication
                updateStatus('Checking authentication...');
                const auth = gapi.auth2.getAuthInstance();
                if (!auth.isSignedIn.get()) {
                    updateStatus('Please authorize Google Drive access...');
                    try {
                        await auth.signIn();
                        updateStatus('Authorization successful');
                    } catch (authError) {
                        throw new Error(`Authorization failed: ${authError.message}`);
                    }
                }

                // Get or create the backup folder
                updateStatus('Accessing backup folder...');
                const folder = await createOrGetFolder();
                if (!folder) {
                    throw new Error('Failed to access backup folder');
                }
                updateStatus('Backup folder ready');

                // Set up automatic backup schedule
                updateStatus('Setting up backup schedule...');
                setInterval(async () => {
                    const now = new Date();
                    if (!lastBackupTime || (now - lastBackupTime) >= CONFIG.BACKUP_FREQUENCY) {
                        await createBackup();
                    }
                }, 60 * 60 * 1000); // Check every hour

                // Create initial backup
                updateStatus('Creating initial backup...');
                await createBackup();

                updateStatus('Backup system initialized successfully');
            } catch (error) {
                updateStatus(`Initialization failed: ${error.message}`, 'error');
                log(error, 'error');
                console.error('Full error details:', error);
            }
        };

        // Start the extension
        initialize();
    })();
};
document.head.appendChild(script);
