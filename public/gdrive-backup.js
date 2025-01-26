// TypingMind Google Drive Backup Extension
(() => {
    const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
    const CLIENT_ID = '753342971428-ock50rvg2d0rf6h4e67lb2ssvkvqpq2n.apps.googleusercontent.com';
    let accessToken = null;
    let folderId = null;

    function authorize() {
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=https://www.typingmind.com&response_type=token&scope=${SCOPES.join(' ')}`;
        const authWindow = window.open(authUrl, '_blank', 'width=600,height=700');
        
        return new Promise((resolve, reject) => {
            const checkAuth = setInterval(() => {
                try {
                    if (authWindow.closed) {
                        clearInterval(checkAuth);
                        reject(new Error('Authorization window closed'));
                    }
                    
                    const hash = authWindow.location.hash;
                    if (hash) {
                        const params = new URLSearchParams(hash.slice(1));
                        accessToken = params.get('access_token');
                        if (accessToken) {
                            authWindow.close();
                            clearInterval(checkAuth);
                            resolve(accessToken);
                        }
                    }
                } catch (e) {}
            }, 500);
        });
    }

    async function createBackup() {
        try {
            if (!accessToken) {
                await authorize();
            }

            // Get or create backup folder
            const folderSearchResponse = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=name='TypingMind Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                }
            );
            const folderData = await folderSearchResponse.json();

            if (folderData.files?.length > 0) {
                folderId = folderData.files[0].id;
            } else {
                const createFolderResponse = await fetch(
                    'https://www.googleapis.com/drive/v3/files',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: 'TypingMind Backup',
                            mimeType: 'application/vnd.google-apps.folder'
                        })
                    }
                );
                const newFolder = await createFolderResponse.json();
                folderId = newFolder.id;
            }

            // Create backup file
            const chats = Object.entries(localStorage)
                .filter(([key]) => key.startsWith('chat:'))
                .map(([_, value]) => JSON.parse(value));

            const backupData = {
                timestamp: new Date().toISOString(),
                chats: chats
            };

            const createFileResponse = await fetch(
                'https://www.googleapis.com/drive/v3/files',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: `TypingMind_Backup_${new Date().toISOString()}.json`,
                        parents: [folderId]
                    })
                }
            );
            const file = await createFileResponse.json();

            await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(backupData)
                }
            );

            alert('Backup completed successfully!');
        } catch (error) {
            console.error('Backup failed:', error);
            alert('Backup failed: ' + error.message);
        }
    }

    // Add backup button to sidebar
    function addBackupButton() {
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

    // Initialize
    function initialize() {
        addBackupButton();
        setInterval(addBackupButton, 1000);
    }

    initialize();
})();
