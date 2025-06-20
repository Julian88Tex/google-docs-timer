// Popup script for Google Docs Timer Extension

function initializePopup() {
  console.log('Popup script loading...');
  
  // Set the correct keyboard shortcut for the platform
  const shortcutKey = document.getElementById('shortcutKey');
  const shortcutNote = document.getElementById('shortcutNote');
  if (navigator.platform.includes('Mac')) {
    shortcutKey.textContent = '⌘+Shift+U';
    shortcutNote.textContent = 'To use a different shortcut, set it at chrome://extensions/shortcuts';
    const dictWarning = document.getElementById('dictWarning');
    if (dictWarning) {
      dictWarning.style.display = 'none'; // No dictionary conflict for this shortcut
    }
  } else {
    shortcutKey.textContent = 'Ctrl+Shift+U';
    shortcutNote.textContent = 'You can set your own shortcut at chrome://extensions/shortcuts';
  }

  // Check if we're on Google Docs
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    const url = currentTab.url;
    
    console.log('Popup checking URL:', url);
    
    // More comprehensive Google Docs detection
    const isGoogleDocs = url.includes('docs.google.com/document') || 
                        url.includes('docs.google.com/spreadsheets') ||
                        url.includes('docs.google.com/presentation') ||
                        (url.includes('docs.google.com') && (url.includes('/d/') || url.includes('/edit')));
    
    const checkIcon = document.getElementById('checkIcon');
    const checkText = document.getElementById('checkText');
    
    console.log('Is Google Docs:', isGoogleDocs);
    
    if (isGoogleDocs) {
      checkIcon.textContent = '✓';
      checkIcon.className = 'check-icon success';
      checkText.textContent = 'Google Docs detected';
      
      // Give content script time to load, then try to communicate
      setTimeout(function() {
        chrome.tabs.sendMessage(currentTab.id, {action: 'getTimerInfo'}, function(response) {
          if (chrome.runtime.lastError) {
            console.log('Content script communication error:', chrome.runtime.lastError.message);
            checkText.textContent = 'Google Docs detected (extension loading...)';
          } else if (response) {
            document.getElementById('timerCount').textContent = response.total || 0;
            document.getElementById('runningCount').textContent = response.running || 0;
            checkText.textContent = 'Extension ready!';
          } else {
            console.log('No response from content script');
            checkText.textContent = 'Google Docs detected (please refresh page)';
          }
        });
      }, 1000);
    } else {
      checkIcon.textContent = '✗';
      checkIcon.className = 'check-icon error';
      checkText.textContent = 'Please open a Google Docs document';
      console.log('Not on Google Docs. URL:', url);
    }
  });

  // Add refresh instruction
  document.body.addEventListener('click', function(e) {
    if (e.target.textContent && e.target.textContent.includes('refresh')) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.reload(tabs[0].id);
        window.close();
      });
    }
  });

  document.getElementById('show-panel-btn').onclick = function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showPanel' });
    });
  };
}

function updateButtonState() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'isPanelOpen' }, function(response) {
      const btn = document.getElementById('toggle-panel-btn');
      if (response && response.open) {
        btn.textContent = 'Hide Timer Panel';
        btn.onclick = function() {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'hidePanel' });
          setTimeout(updateButtonState, 200);
        };
      } else {
        btn.textContent = 'Show Timer Panel';
        btn.onclick = function() {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'showPanel' });
          setTimeout(updateButtonState, 200);
        };
      }
    });
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
  document.addEventListener('DOMContentLoaded', updateButtonState);
} else {
  initializePopup();
  updateButtonState();
}

document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('show-timers-toggle');
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'isPanelOpen' }, function(response) {
      toggle.checked = !!(response && response.open);
    });
  });
  toggle.onchange = function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (toggle.checked) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'showPanel' });
      } else {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'hidePanel' });
      }
    });
  };
});