const plugin = {
  name: 'Render Backup',
  description: 'Backup chats to Render server',
  version: '1.0',
  apiUrl: 'https://plugins-server-8ylu.onrender.com/backup-sync',

  async onload() {
    // Add backup button to the UI
    const button = document.createElement('button');
    button.className = 'tm-button';
    button.innerHTML = '💾 Backup';
    button.onclick = () => this.backupCurrentChat();
    
    // Add restore button
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'tm-button';
    restoreBtn.innerHTML = '📂 Restore';
    restoreBtn.onclick = () => this.showRestoreDialog();
    
    // Add to TypingMind toolbar
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      toolbar.appendChild(button);
      toolbar.appendChild(restoreBtn);
    }
  },

  async backupCurrentChat() {
    try {
      const chat = window.typingMind.getCurrentChat();
      if (!chat) {
        alert('No chat to backup!');
        return;
      }

      const response = await fetch(`${this.apiUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chat)
      });
      
      const result = await response.json();
      if (result.success) {
        alert('Backup created successfully!');
      } else {
        throw new Error(result.error || 'Backup failed');
      }
    } catch (error) {
      console.error('Backup error:', error);
      alert('Failed to create backup: ' + error.message);
    }
  },

  async showRestoreDialog() {
    try {
      // Get list of backups
      const response = await fetch(`${this.apiUrl}/list`);
      const result = await response.json();
      
      if (!result.success || !result.backups.length) {
        alert('No backups found');
        return;
      }

      // Create simple dialog to show backups
      const dialog = document.createElement('dialog');
      dialog.innerHTML = `
        <div style="padding: 20px;">
          <h3>Select Backup to Restore</h3>
          <select id="backup-select" style="width: 100%; margin: 10px 0;">
            ${result.backups.map(f => `
              <option value="${f}">${f}</option>
            `).join('')}
          </select>
          <div style="margin-top: 15px;">
            <button onclick="this.closest('dialog').close()">Cancel</button>
            <button onclick="window.typingMind.plugins['render-backup'].restoreBackup(this.closest('dialog').querySelector('select').value, this.closest('dialog'))">
              Restore
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(dialog);
      dialog.showModal();
    } catch (error) {
      console.error('Show restore dialog error:', error);
      alert('Failed to load backups: ' + error.message);
    }
  },

  async restoreBackup(filename, dialog) {
    try {
      const response = await fetch(`${this.apiUrl}/latest`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Restore failed');
      }

      // Load the chat data into TypingMind
      window.typingMind.loadChat(result.data);
      alert('Chat restored successfully!');
      
      // Close the dialog if provided
      if (dialog) dialog.close();
    } catch (error) {
      console.error('Restore error:', error);
      alert('Failed to restore backup: ' + error.message);
    }
  }
};

// Register the plugin
window.typingMind.registerPlugin('render-backup', plugin);

