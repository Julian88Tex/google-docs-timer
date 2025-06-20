// Google Docs Timer Extension - Content Script
class DocsTimerManager {
  constructor() {
    this.timers = new Map();
    this.timerCounter = 0;
    this.isGoogleDocs = false;
    this.init();
  }

  init() {
    // Check if we're in Google Docs with more comprehensive detection
    const url = window.location.href;
    if (url.includes('docs.google.com/document') || 
        url.includes('docs.google.com/spreadsheets') ||
        (url.includes('docs.google.com') && url.includes('/d/'))) {
      this.isGoogleDocs = true;
      console.log('Google Docs Timer: Detected Google Docs');
      this.waitForDocsToLoad();
    } else {
      console.log('Google Docs Timer: Not on Google Docs');
    }

    // Add message listener for popup communication
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getTimerInfo') {
        const total = this.timers.size;
        const running = Array.from(this.timers.values()).filter(t => t.isRunning).length;
        sendResponse({total, running});
      } else if (request.action === 'addTimer') {
        console.log('Received "addTimer" message from background script.');
        this.addTimerAtCursor();
        sendResponse({status: "Timer added successfully."});
      }
      return true;
    });
  }

  waitForDocsToLoad() {
    // Wait for Google Docs to fully load
    let attempts = 0;
    const maxAttempts = 20;
    
    const checkForDocs = () => {
      attempts++;
      console.log(`Google Docs Timer: Checking for docs elements (attempt ${attempts})`);
      
      // Multiple selectors to catch different Google Docs layouts
      const docsCanvas = document.querySelector('.kix-canvas-tile-content') ||
                        document.querySelector('[role="textbox"]') ||
                        document.querySelector('.docs-texteventtarget-iframe') ||
                        document.querySelector('#docs-editor') ||
                        document.querySelector('.kix-appview-editor');
      
      if (docsCanvas) {
        console.log('Google Docs Timer: Found docs element, setting up extension');
        this.setupExtension();
      } else if (attempts < maxAttempts) {
        setTimeout(checkForDocs, 1000);
      } else {
        console.log('Google Docs Timer: Could not find docs elements, setting up anyway');
        this.setupExtension();
      }
    };
    checkForDocs();
  }

  setupExtension() {
    console.log('Google Docs Timer: Setting up extension');
    this.createTimersPanel();
    this.observeDocumentChanges();
    console.log('Google Docs Timer: Extension setup complete');
  }

  createTimersPanel() {
    if (document.getElementById('docs-timers-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'docs-timers-panel';
    // Restore position from localStorage if available
    const saved = localStorage.getItem('docsTimersPanelPos');
    if (saved) {
      const {top, left} = JSON.parse(saved);
      panel.style.top = top;
      panel.style.left = left;
      panel.style.right = '';
      panel.style.position = 'fixed';
    } else {
      panel.style.top = '80px';
      panel.style.right = '32px';
      panel.style.position = 'fixed';
    }
    panel.style.width = '220px';
    panel.style.background = 'white';
    panel.style.border = '1px solid #ddd';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    panel.style.zIndex = '99999';
    panel.style.padding = '12px 10px 10px 10px';
    panel.style.fontFamily = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    panel.style.fontSize = '13px';
    panel.style.userSelect = 'none';
    panel.innerHTML = `
      <div id="timers-panel-header" style="font-weight:bold; font-size:15px; margin-bottom:8px; display:flex; align-items:center; gap:6px; cursor:move; user-select:none;">
        ⏱️ Timers
      </div>
      <div id="timers-list"></div>
    `;
    document.body.appendChild(panel);
    this.makePanelDraggable(panel, panel.querySelector('#timers-panel-header'));
    this.updateTimersPanel();
    // Periodically update timers panel for live countdown
    if (!this._timersPanelInterval) {
      this._timersPanelInterval = setInterval(() => {
        this.updateTimersPanel();
      }, 1000);
    }
  }

  makePanelDraggable(panel, handle) {
    let offsetX = 0, offsetY = 0, startX = 0, startY = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      offsetX = startX - rect.left;
      offsetY = startY - rect.top;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      let newLeft = e.clientX - offsetX;
      let newTop = e.clientY - offsetY;
      // Keep within viewport
      newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, newTop));
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
      panel.style.right = '';
      panel.style.position = 'fixed';
    });
    document.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;
      // Save position
      localStorage.setItem('docsTimersPanelPos', JSON.stringify({
        top: panel.style.top,
        left: panel.style.left
      }));
      document.body.style.userSelect = '';
    });
  }

  updateTimersPanel() {
    const list = document.getElementById('timers-list');
    if (!list) return;
    list.innerHTML = '';
    if (this.timers.size === 0) {
      list.innerHTML = '<div style="color:#888;">No timers</div>';
      return;
    }
    for (const [timerId, timerData] of this.timers.entries()) {
      const timerDiv = document.createElement('div');
      timerDiv.style.display = 'flex';
      timerDiv.style.alignItems = 'center';
      timerDiv.style.justifyContent = 'space-between';
      timerDiv.style.marginBottom = '8px';
      timerDiv.style.gap = '6px';
      timerDiv.style.padding = '4px 0';
      timerDiv.style.borderBottom = '1px solid #f0f0f0';
      timerDiv.innerHTML = `
        <span style="font-variant-numeric: tabular-nums; min-width:60px; display:inline-block;">${this.formatTime(timerData.timeLeft)}</span>
        <span style="color:#ff9800; font-size:12px; margin-right:6px;">${timerData.label ? timerData.label : ''}</span>
        <span>
          <button style="font-size:13px; margin-right:2px;" title="Start/Pause">${timerData.isRunning ? '⏸️' : '▶️'}</button>
          <button style="font-size:13px; margin-right:2px;" title="Reset">🔄</button>
          <button style="font-size:13px;" title="Delete">❌</button>
        </span>
      `;
      // Button actions
      const [playBtn, resetBtn, deleteBtn] = timerDiv.querySelectorAll('button');
      playBtn.onclick = () => this.toggleTimer(timerId);
      resetBtn.onclick = () => this.resetTimer(timerId);
      deleteBtn.onclick = () => this.deleteTimer(timerId);
      list.appendChild(timerDiv);
    }
  }

  createFloatingButton() {
    // Remove any existing floating button first
    const existingBtn = document.getElementById('docs-timer-floating-btn');
    if (existingBtn) {
      existingBtn.remove();
    }

    // Create floating add timer button
    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'docs-timer-floating-btn';
    floatingBtn.innerHTML = '⏱️';
    floatingBtn.title = 'Add Timer (⌘+Option+T on Mac, Ctrl+Alt+T on PC)';
    floatingBtn.className = 'docs-timer-floating-btn';
    
    // Multiple event listeners to ensure it works
    floatingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Floating button clicked!');
      this.addTimerAtCursor();
    });

    floatingBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Add to body with high priority
    document.body.appendChild(floatingBtn);
    console.log('Google Docs Timer: Floating button created');
    
    // Test if button is clickable
    setTimeout(() => {
      const btn = document.getElementById('docs-timer-floating-btn');
      if (btn) {
        console.log('Google Docs Timer: Button exists and is in DOM');
        console.log('Button style:', window.getComputedStyle(btn).zIndex);
      }
    }, 1000);
  }

  addTimerAtCursor() {
    console.log('AddTimerAtCursor called!');
    
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      console.log('No selection range found, trying alternative method');
      this.addTimerAlternative();
      return;
    }

    const range = selection.getRangeAt(0);
    const timerId = `timer-${++this.timerCounter}`;
    
    console.log(`Creating timer with ID: ${timerId}`);
    
    // Create timer element
    const timerElement = this.createTimerElement(timerId);
    
    // Insert at cursor position
    try {
      range.deleteContents();
      range.insertNode(timerElement);
      
      // Move cursor after the timer
      range.setStartAfter(timerElement);
      range.setEndAfter(timerElement);
      selection.removeAllRanges();
      selection.addRange(range);
      
      console.log('Timer inserted successfully');
    } catch (error) {
      console.error('Failed to insert timer:', error);
      // Fallback: append to document
      this.insertTimerAlternative(timerElement);
    }
    this.updateTimersPanel();
  }

  addTimerAlternative() {
    console.log('Using alternative timer insertion method');
    const timerId = `timer-${++this.timerCounter}`;
    const timerElement = this.createTimerElement(timerId);
    
    // Try to find the document body or editor area
    const editorArea = document.querySelector('.kix-canvas-tile-content') ||
                      document.querySelector('[role="textbox"]') ||
                      document.querySelector('.docs-texteventtarget-iframe') ||
                      document.querySelector('#docs-editor') ||
                      document.querySelector('.kix-appview-editor') ||
                      document.body;
    
    if (editorArea) {
      // Create a wrapper paragraph
      const wrapper = document.createElement('p');
      wrapper.appendChild(timerElement);
      editorArea.appendChild(wrapper);
      console.log('Timer added using alternative method');
    } else {
      console.error('Could not find suitable container for timer');
    }
    this.updateTimersPanel();
  }

  createTimerElement(timerId, initialMinutes = 5) {
    const container = document.createElement('span');
    container.className = 'docs-timer-container';
    container.contentEditable = false;
    container.style.display = 'inline-block';
    container.style.margin = '0 4px';
    
    const timer = document.createElement('span');
    timer.className = 'docs-timer';
    timer.id = timerId;
    timer.innerHTML = `
      <span class="timer-display">${this.formatTime(initialMinutes * 60)}</span>
      <span class="timer-controls">
        <button class="timer-btn timer-play" title="Start/Pause">▶️</button>
        <button class="timer-btn timer-reset" title="Reset">🔄</button>
        <button class="timer-btn timer-settings" title="Settings">⚙️</button>
        <button class="timer-btn timer-delete" title="Delete">❌</button>
      </span>
    `;

    // Initialize timer data
    this.timers.set(timerId, {
      element: timer,
      timeLeft: initialMinutes * 60,
      totalTime: initialMinutes * 60,
      isRunning: false,
      interval: null
    });

    this.setupTimerControls(timer, timerId);
    container.appendChild(timer);
    
    return container;
  }

  setupTimerControls(timer, timerId) {
    const timerData = this.timers.get(timerId);
    
    // Play/Pause button
    const playBtn = timer.querySelector('.timer-play');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleTimer(timerId);
    });

    // Reset button
    const resetBtn = timer.querySelector('.timer-reset');
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetTimer(timerId);
    });

    // Settings button
    const settingsBtn = timer.querySelector('.timer-settings');
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTimerSettings(timerId);
    });

    // Delete button
    const deleteBtn = timer.querySelector('.timer-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteTimer(timerId);
    });

    // Show controls on hover
    timer.addEventListener('mouseenter', () => {
      timer.classList.add('timer-hover');
    });

    timer.addEventListener('mouseleave', () => {
      timer.classList.remove('timer-hover');
    });
  }

  toggleTimer(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    if (timerData.isRunning) {
      this.pauseTimer(timerId);
    } else {
      this.startTimer(timerId);
    }
    this.updateTimersPanel();
  }

  startTimer(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    timerData.isRunning = true;
    const playBtn = timerData.element.querySelector('.timer-play');
    playBtn.innerHTML = '⏸️';
    playBtn.title = 'Pause';

    timerData.element.classList.add('timer-running');

    timerData.interval = setInterval(() => {
      timerData.timeLeft--;
      this.updateTimerDisplay(timerId);

      if (timerData.timeLeft <= 0) {
        this.timerFinished(timerId);
      }
    }, 1000);
    this.updateTimersPanel();
  }

  pauseTimer(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    timerData.isRunning = false;
    clearInterval(timerData.interval);
    
    const playBtn = timerData.element.querySelector('.timer-play');
    playBtn.innerHTML = '▶️';
    playBtn.title = 'Start';

    timerData.element.classList.remove('timer-running');
    this.updateTimersPanel();
  }

  resetTimer(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    this.pauseTimer(timerId);
    timerData.timeLeft = timerData.totalTime;
    timerData.element.classList.remove('timer-finished');
    this.updateTimerDisplay(timerId);
    this.updateTimersPanel();
  }

  updateTimerDisplay(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    const display = timerData.element.querySelector('.timer-display');
    display.textContent = this.formatTime(timerData.timeLeft);

    // Change color based on time remaining
    const percentage = timerData.timeLeft / timerData.totalTime;
    if (percentage <= 0.1) {
      timerData.element.classList.add('timer-critical');
    } else if (percentage <= 0.25) {
      timerData.element.classList.add('timer-warning');
    } else {
      timerData.element.classList.remove('timer-critical', 'timer-warning');
    }
  }

  timerFinished(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    this.pauseTimer(timerId);
    timerData.element.classList.add('timer-finished');
    
    // Show notification
    this.showNotification('Timer finished!', `Timer "${timerId}" has reached zero.`);
    
    // Flash the timer
    this.flashTimer(timerId);
  }

  flashTimer(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    let flashCount = 0;
    const flashInterval = setInterval(() => {
      timerData.element.style.opacity = timerData.element.style.opacity === '0.3' ? '1' : '0.3';
      flashCount++;
      
      if (flashCount >= 6) {
        clearInterval(flashInterval);
        timerData.element.style.opacity = '1';
      }
    }, 300);
  }

  showTimerSettings(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    const currentMinutes = Math.ceil(timerData.totalTime / 60);
    const newMinutes = prompt(`Set timer duration (minutes):`, currentMinutes);
    
    if (newMinutes && !isNaN(newMinutes) && newMinutes > 0) {
      const newTime = parseInt(newMinutes) * 60;
      timerData.totalTime = newTime;
      timerData.timeLeft = newTime;
      timerData.element.classList.remove('timer-finished', 'timer-critical', 'timer-warning');
      this.updateTimerDisplay(timerId);
    }
  }

  deleteTimer(timerId) {
    const timerData = this.timers.get(timerId);
    if (!timerData) return;

    if (confirm('Delete this timer?')) {
      this.pauseTimer(timerId);
      timerData.element.parentElement.remove();
      this.timers.delete(timerId);
    }
    this.updateTimersPanel();
  }

  formatTime(seconds) {
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.abs(seconds) % 60;
    const sign = seconds < 0 ? '-' : '';
    return `${sign}${mins}:${secs.toString().padStart(2, '0')}`;
  }

  showNotification(title, message) {
    // Try to use browser notifications
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body: message });
        }
      });
    }

    // Fallback: create custom notification
    this.createCustomNotification(title, message);
  }

  createCustomNotification(title, message) {
    const notification = document.createElement('div');
    notification.className = 'docs-timer-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <strong>${title}</strong>
        <p>${message}</p>
        <button class="notification-close">×</button>
      </div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);

    // Manual close
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.remove();
    });
  }

  insertTimerAlternative(timerElement) {
    // Alternative method to insert timer when direct cursor insertion fails
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = document.createTextNode(' ');
      range.insertNode(textNode);
      range.insertNode(timerElement);
    }
  }

  observeDocumentChanges() {
    // Observe document changes to maintain timer functionality
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Re-initialize any timers that may have been affected
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const timers = node.querySelectorAll('.docs-timer');
            timers.forEach((timer) => {
              if (this.timers.has(timer.id)) {
                this.timers.delete(timer.id);
              }
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observeTimeStrings();
  }

  observeTimeStrings() {
    // Observe the main editor for text changes
    const editorArea = document.querySelector('.kix-appview-editor');
    if (!editorArea) return;
    const observer = new MutationObserver(() => {
      this.showTimeStringOverlays(editorArea);
    });
    observer.observe(editorArea, { childList: true, subtree: true, characterData: true });
    this.showTimeStringOverlays(editorArea);
    // Periodically rescan for overlays (handles Google Docs virtual DOM)
    if (!this._timeStringInterval) {
      this._timeStringInterval = setInterval(() => {
        this.showTimeStringOverlays(editorArea);
      }, 1500);
    }
  }

  showTimeStringOverlays(root) {
    // Debug: scan counter
    if (!window.docsTimerDebugCounter) {
      const counter = document.createElement('div');
      counter.id = 'docs-timer-debug-counter';
      counter.style.position = 'fixed';
      counter.style.top = '0';
      counter.style.left = '0';
      counter.style.background = '#222';
      counter.style.color = '#fff';
      counter.style.zIndex = '100001';
      counter.style.fontSize = '14px';
      counter.style.padding = '2px 8px';
      counter.textContent = 'Scans: 0';
      document.body.appendChild(counter);
      window.docsTimerDebugCounter = counter;
      window.docsTimerDebugCount = 0;
    }
    window.docsTimerDebugCount++;
    window.docsTimerDebugCounter.textContent = 'Scans: ' + window.docsTimerDebugCount;

    // Remove old overlays
    document.querySelectorAll('.docs-timer-overlay-btn').forEach(btn => btn.remove());
    // Remove old highlights
    document.querySelectorAll('.docs-timer-debug-highlight').forEach(el => el.classList.remove('docs-timer-debug-highlight'));
    // Regex for time strings: 3m, 5m, 2:00, 10min, etc.
    const timeRegex = /\b(\d{1,2}m(in)?|\d{1,2}:\d{2})\b/gi;
    // Scan for SVG <rect> elements with aria-label
    const rects = document.querySelectorAll('svg rect[aria-label]');
    rects.forEach(rect => {
      const label = rect.getAttribute('aria-label');
      if (!label) return;
      let match;
      while ((match = timeRegex.exec(label)) !== null) {
        if (!match || !match[0]) continue;
        // Get the parent SVG's bounding rect
        const svg = rect.ownerSVGElement;
        if (!svg) return;
        const svgRect = svg.getBoundingClientRect();
        // Calculate overlay position using rect's x/y/width/height and SVG's position
        let x = parseFloat(rect.getAttribute('x') || '0');
        let y = parseFloat(rect.getAttribute('y') || '0');
        let width = parseFloat(rect.getAttribute('width') || '0');
        let height = parseFloat(rect.getAttribute('height') || '0');
        // Refined: center vertically with the rect, offset right
        let left = svgRect.left + x + width + 8;
        let top = svgRect.top + y + height / 2 - 14; // 14px = half overlay height
        // Fallback: if left is off-screen, move to mouse on hover
        const btn = document.createElement('div');
        btn.className = 'docs-timer-overlay-btn';
        btn.textContent = '+⏱️';
        btn.title = 'Add timer for ' + match[0];
        btn.dataset.timerMatch = match[0];
        btn.style.position = 'fixed';
        btn.style.left = left + 'px';
        btn.style.top = top + 'px';
        btn.style.background = '#fffbe7';
        btn.style.border = '1px solid #ffe082';
        btn.style.borderRadius = '4px';
        btn.style.padding = '1px 6px';
        btn.style.fontSize = '13px';
        btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '100000';
        btn.style.userSelect = 'none';
        btn.style.transition = 'background 0.2s';
        btn.setAttribute('title', 'Click to add timer to panel');
        btn.onmouseenter = (e) => {
          btn.style.background = '#ffe082';
          if (left < 50) {
            btn.style.left = (e.clientX + 16) + 'px';
            btn.style.top = (e.clientY - 14) + 'px';
          }
        };
        btn.onmouseleave = () => btn.style.background = '#fffbe7';
        btn.onclick = (e) => {
          e.stopPropagation();
          const matchValue = btn.dataset.timerMatch;
          if (!matchValue) return;
          let minutes = 0;
          if (/^\d{1,2}m(in)?$/i.test(matchValue)) {
            minutes = parseInt(matchValue);
          } else if (/^\d{1,2}:\d{2}$/.test(matchValue)) {
            const [min, sec] = matchValue.split(':').map(Number);
            minutes = min + (sec >= 30 ? 1 : 0);
          }
          if (minutes > 0) {
            this.addTimerToPanel(minutes, matchValue);
            this.showConfirmation(left, top, matchValue);
          }
          btn.remove();
        };
        document.body.appendChild(btn);
      }
    });
  }

  addTimerToPanel(minutes, label) {
    const timerId = `timer-${++this.timerCounter}`;
    const timerElement = this.createTimerElement(timerId, minutes);
    // Optionally, you could add the label to the timer UI
    this.timers.set(timerId, {
      element: timerElement,
      timeLeft: minutes * 60,
      totalTime: minutes * 60,
      isRunning: false,
      interval: null,
      label: label
    });
    this.updateTimersPanel();
    this.startTimer(timerId);
  }

  showConfirmation(left, top, label) {
    const conf = document.createElement('div');
    conf.textContent = `Timer for ${label} added!`;
    conf.style.position = 'fixed';
    conf.style.left = left + 40 + 'px';
    conf.style.top = top + 'px';
    conf.style.background = '#4caf50';
    conf.style.color = '#fff';
    conf.style.padding = '4px 12px';
    conf.style.borderRadius = '4px';
    conf.style.fontSize = '13px';
    conf.style.zIndex = '100001';
    conf.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    document.body.appendChild(conf);
    setTimeout(() => conf.remove(), 1200);
  }
}

// Initialize the extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new DocsTimerManager();
  });
} else {
  new DocsTimerManager();
}