// Google Docs Timer Extension - Content Script
class DocsTimerManager {
  constructor() {
    this.timers = new Map();
    this.timerCounter = 0;
    this.isGoogleDocs = false;
    this.minimized = false; // Track minimized state
    this.draggedTimerId = null; // For drag-and-drop
    this.timerOrder = JSON.parse(localStorage.getItem('docsTimerOrder') || '[]');
    this.timersToShowCount = 5; // Start with 5 timers
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
      } else if (request.action === 'showPanel') {
        localStorage.setItem('docsTimersPanelClosed', 'false');
        this.createTimersPanel();
        sendResponse({status: 'ok'});
      } else if (request.action === 'hidePanel') {
        const panel = document.getElementById('docs-timers-panel');
        if (panel) panel.remove();
        localStorage.setItem('docsTimersPanelClosed', 'true');
        sendResponse({status: 'ok'});
      } else if (request.action === 'isPanelOpen') {
        const panel = document.getElementById('docs-timers-panel');
        sendResponse({open: !!panel});
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
    console.log('Google Docs Timer: Extension setup complete');
  }

  createTimersPanel() {
    if (document.getElementById('docs-timers-panel')) return;
    if (localStorage.getItem('docsTimersPanelClosed') === 'true') return;
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
    panel.style.width = '300px';
    panel.style.background = 'rgba(255,255,255,0.96)';
    panel.style.border = '1px solid #e0e0e0';
    panel.style.borderRadius = '14px';
    panel.style.boxShadow = '0 4px 24px rgba(0,0,0,0.10)';
    panel.style.zIndex = '99999';
    panel.style.padding = '7px 6px 6px 6px';
    panel.style.fontFamily = 'Inter, Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    panel.style.fontSize = '14px';
    panel.style.userSelect = 'none';
    panel.style.maxHeight = '70vh';
    panel.style.overflowY = 'scroll'; // Always show scrollbar
    panel.style.scrollbarGutter = 'stable'; // Reserve space for scrollbar
    panel.innerHTML = `
      <div id="timers-panel-header" style="position:sticky;top:0;z-index:2;background:rgba(255,255,255,0.96);backdrop-filter:blur(2px);font-weight:600; font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:6px; user-select:none; letter-spacing:0.01em; padding-bottom:2px; border-bottom:1px solid #eee; min-height:28px;">
        <span style="display:flex;align-items:center;gap:4px;">⏱️ <span style="font-weight:500;">TimeBox</span></span>
        <span id="timers-total-sum" style="font-weight:bold;font-size:12px;margin-left:auto;text-align:right;flex:1;white-space:nowrap;overflow:hidden;"> </span>
        <button id="timers-minimize-btn" style="font-size:12px; padding:1px 7px; border-radius:5px; border:none; background:#f3f4f6; color:#444; cursor:pointer; transition:background 0.2s; height:22px; min-width:22px; display:flex;align-items:center;justify-content:center;">${this.minimized ? '▲' : '▼'}</button>
        <button id="timers-close-btn" style="margin-left:4px; font-size:13px; padding:1px 10px; border-radius:5px; border:none; background:none; color:#888; cursor:pointer; transition:background 0.2s; height:22px; min-width:32px; display:flex;align-items:center;justify-content:center; text-decoration:underline;">Hide</button>
      </div>
      <div id="timers-list"></div>
      <button id="timers-load-more-btn" style="display:none;margin:6px auto 0 auto;padding:3px 10px;border-radius:5px;background:#e3e7ea;border:none;font-weight:bold;cursor:pointer;font-size:12px;">Load 5 more timers</button>
    `;
    document.body.appendChild(panel);
    this.makePanelDraggable(panel, panel.querySelector('#timers-panel-header'));
    this.updateTimersPanel();
    // Minimize button logic
    const minBtn = panel.querySelector('#timers-minimize-btn');
    minBtn.onclick = () => {
      this.minimized = !this.minimized;
      minBtn.textContent = this.minimized ? '▲' : '▼';
      this.updateTimersPanel();
    };
    // Close button logic
    const closeBtn = panel.querySelector('#timers-close-btn');
    closeBtn.onclick = () => {
      panel.remove();
      localStorage.setItem('docsTimersPanelClosed', 'true');
    };
    // Load more button logic
    const loadMoreBtn = panel.querySelector('#timers-load-more-btn');
    loadMoreBtn.onclick = () => {
      const timerStrings = this.findTimerStringsInDoc();
      const totalTimers = timerStrings.length;
      const prevCount = this.timersToShowCount;
      this.timersToShowCount = Math.min(this.timersToShowCount + 5, totalTimers);
      // Only add new timers to this.timers and this.timerOrder
      timerStrings.forEach(t => {
        if (!this.timers[t.id]) {
          this.timers[t.id] = {
            timeLeft: t.seconds,
            totalTime: t.seconds,
            isRunning: false,
            completed: false,
            label: t.label
          };
        }
        if (!this.timerOrder.includes(t.id)) {
          this.timerOrder.push(t.id);
        }
      });
      this.updateTimersPanel();
    };
    // Periodically update timers panel for live countdown
    if (!this._timersPanelInterval) {
      this._timersPanelInterval = setInterval(() => {
        this.updateTimersPanel();
      }, 1000);
    }
    // Initial scan
    this.scanAndUpdateTimers();
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
    if (this.dropIndicator) {
      this.dropIndicator.remove();
      this.dropIndicator = null;
    }
    // For the visible timers, always rescan the doc for the latest list
    const timerStrings = this.findTimerStringsInDoc();
    // Build a map for fast lookup
    const timerMap = {};
    timerStrings.forEach(t => { timerMap[t.id] = t; });
    // Ensure this.timers is an object for fast lookup
    if (!this.timers || Array.isArray(this.timers)) this.timers = {};
    // Only keep timerOrder entries that are present in the current doc scan
    this.timerOrder = (this.timerOrder || []).filter(id => timerMap[id]);
    // Add any new timers (not in order) to the end
    timerStrings.forEach(t => {
      if (!this.timerOrder.includes(t.id)) this.timerOrder.push(t.id);
    });
    // Use timerOrder to determine visible timers
    let timersArr = this.timerOrder.slice(0, this.timersToShowCount).map(id => {
      let t = timerMap[id];
      let state = this.timers[id] || {};
      if (!this.timers[id]) {
        this.timers[id] = {
          timeLeft: t.seconds,
          totalTime: t.seconds,
          isRunning: false,
          completed: false,
          label: t.label
        };
      }
      return [id, Object.assign({}, t, this.timers[id])];
    });
    // Minimize logic: only show running timer and next (or first incomplete) when minimized
    if (this.minimized) {
      let runningIdx = timersArr.findIndex(([id, t]) => t.isRunning);
      let running = runningIdx !== -1 ? timersArr[runningIdx] : null;
      let nextIdx = -1;
      if (runningIdx !== -1) {
        // Next timer after running, not completed
        nextIdx = timersArr.findIndex(([id, t], i) => i > runningIdx && !t.completed);
      } else {
        // No running: show first incomplete
        nextIdx = timersArr.findIndex(([id, t]) => !t.completed);
      }
      let next = nextIdx !== -1 ? timersArr[nextIdx] : null;
      let minimizedTimers = [];
      if (running) minimizedTimers.push(running);
      if (next && (!running || next[0] !== running[0])) minimizedTimers.push(next);
      if (!running && !next && timersArr.length > 0) {
        // All completed: show top timer
        minimizedTimers.push(timersArr[0]);
      }
      timersArr = minimizedTimers.filter(Boolean);
    }
    // --- Total time at the top: sum of remaining time for visible timers only ---
    let totalSeconds = 0;
    timersArr.forEach(([id, t]) => {
      if (typeof t.timeLeft === 'number') totalSeconds += Math.max(0, t.timeLeft);
      else if (typeof t.seconds === 'number') totalSeconds += Math.max(0, t.seconds);
    });
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    const totalStr = `Total: ${min}:${sec.toString().padStart(2, '0')}`;
    let sumDiv = document.getElementById('timers-total-sum');
    if (sumDiv) sumDiv.textContent = totalStr;
    if (timersArr.length === 0) {
      list.innerHTML = '<div style="color:#bbb; text-align:center; font-size:13px; padding:18px 0;">No timers</div>';
      const loadMoreBtn = document.getElementById('timers-load-more-btn');
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }
    // For drop indicator
    const createDropIndicator = () => {
      const ind = document.createElement('div');
      ind.style.height = '0px';
      ind.style.borderTop = '3px solid #4caf50';
      ind.style.margin = '0 0 0 0';
      ind.style.borderRadius = '2px';
      ind.style.transition = 'border-color 0.2s';
      ind.className = 'timer-drop-indicator';
      return ind;
    };
    let dropIndicatorIdx = null;
    timersArr.forEach(([timerId, timerData], idx) => {
      const timerDiv = document.createElement('div');
      timerDiv.style.display = 'flex';
      timerDiv.style.alignItems = 'center';
      timerDiv.style.justifyContent = 'space-between';
      timerDiv.style.marginBottom = '2px';
      timerDiv.style.gap = '2px';
      timerDiv.style.padding = '2px 0 2px 0';
      timerDiv.style.borderRadius = '6px';
      timerDiv.style.minHeight = '22px';
      // Modern color palette
      if (timerData.completed) {
        timerDiv.style.background = '#e6f9ed'; // soft green
      } else if (timerData.isRunning) {
        timerDiv.style.background = '#ffeaea'; // soft red
      } else {
        timerDiv.style.background = '#fff'; // default
      }
      timerDiv.style.transition = 'background 0.2s';
      timerDiv.setAttribute('draggable', 'true');
      timerDiv.setAttribute('data-timer-id', timerId);
      // Drag events
      timerDiv.ondragstart = (e) => {
        this.draggedTimerId = timerId;
        e.dataTransfer.effectAllowed = 'move';
        timerDiv.style.opacity = '0.5';
      };
      timerDiv.ondragend = (e) => {
        this.draggedTimerId = null;
        timerDiv.style.opacity = '';
        if (this.dropIndicator) {
          this.dropIndicator.remove();
          this.dropIndicator = null;
        }
      };
      timerDiv.ondragover = (e) => {
        e.preventDefault();
        // Figure out if mouse is in top or bottom half
        const rect = timerDiv.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        let insertIdx = idx;
        if (offset > rect.height / 2) insertIdx = idx + 1;
        // Only update if changed
        if (dropIndicatorIdx !== insertIdx) {
          if (this.dropIndicator) this.dropIndicator.remove();
          this.dropIndicator = createDropIndicator();
          dropIndicatorIdx = insertIdx;
          if (insertIdx >= list.children.length) {
            list.appendChild(this.dropIndicator);
          } else {
            list.insertBefore(this.dropIndicator, list.children[insertIdx]);
          }
        }
      };
      timerDiv.ondragleave = (e) => {
        timerDiv.style.background = timerData.isRunning ? 'rgba(76,175,80,0.07)' : 'transparent';
      };
      timerDiv.ondrop = (e) => {
        e.preventDefault();
        timerDiv.style.background = timerData.isRunning ? 'rgba(76,175,80,0.07)' : 'transparent';
        if (this.dropIndicator) {
          this.dropIndicator.remove();
          this.dropIndicator = null;
        }
        if (this.draggedTimerId && this.draggedTimerId !== timerId) {
          // Fix: If dragging down, adjust toIdx if fromIdx < toIdx
          const fromIdx = this.timerOrder.indexOf(this.draggedTimerId);
          let toIdx = dropIndicatorIdx !== null ? dropIndicatorIdx : this.timerOrder.indexOf(timerId);
          if (fromIdx !== -1 && toIdx !== -1) {
            if (fromIdx < toIdx) toIdx--;
            this.timerOrder.splice(toIdx, 0, this.timerOrder.splice(fromIdx, 1)[0]);
            localStorage.setItem('docsTimerOrder', JSON.stringify(this.timerOrder));
            this.updateTimersPanel();
          }
        }
      };
      // Render timer row compactly
      timerDiv.innerHTML = `
        <span style="font-variant-numeric: tabular-nums; min-width:32px; display:inline-block; font-size:12px; font-weight:500; color:#222;">${this.formatTime(timerData.timeLeft)}</span>
        <span style="color:#1976d2; font-size:12px; margin:0 3px; flex:1 1 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500; letter-spacing:0.01em;">${timerData.label ? timerData.label : ''}</span>
        <span style="display:flex; align-items:center; gap:1px; flex-shrink:0; white-space:nowrap;">
          ${timerData.timeLeft === 0 ? '<button class="timer-btn timer-checkbox" title="Completed" style="font-size:13px; padding:1px 2px; cursor:default; color:#21c521 !important; background:none; border:none; outline:none; box-shadow:none; pointer-events:none;">☑️</button>' : `<button class="timer-btn timer-play" title="Start/Pause" style="font-size:12px; padding:1px 2px; background:none; border:none; color:#444;">${timerData.isRunning ? '⏸️' : '▶️'}</button>`}
          <button class="timer-btn timer-reset" title="Reset" style="font-size:11px; padding:1px 3px; background:none; border:none; color:#888;">🔄</button>
          <button class="timer-btn timer-settings" title="Settings" style="font-size:11px; padding:1px 3px; background:none; border:none; color:#888;">⚙️</button>
          <button class="timer-btn timer-skip" title="Skip/Complete" style="font-size:13px; padding:1px 3px; background:none; border:none; color:#1976d2;">⏭️</button>
          <button class="timer-btn timer-delete" title="Delete" style="font-size:11px; padding:1px 3px; background:none; border:none; color:#e74c3c;">✕</button>
        </span>
      `;
      // Button actions
      const btns = timerDiv.querySelectorAll('button');
      const playBtn = btns[0];
      const resetBtn = btns[1];
      const settingsBtn = btns[2];
      const skipBtn = btns[3];
      const deleteBtn = btns[4];
      if (timerData.timeLeft === 0) {
        playBtn.disabled = true;
        playBtn.style.cursor = 'default';
      } else {
        playBtn.onclick = () => {
          this.toggleTimer(timerId);
          this.updateTimersPanel();
        };
      }
      resetBtn.onclick = () => {
        this.resetTimer(timerId);
        this.updateTimersPanel();
      };
      settingsBtn.onclick = () => this.showTimerSettings(timerId);
      skipBtn.onclick = () => {
        this.timers[timerId].completed = true;
        this.timers[timerId].isRunning = false;
        this.timers[timerId].timeLeft = 0;
        this.updateTimersPanel();
      };
      deleteBtn.onclick = () => this.deleteTimer(timerId);
      // Complete button
      const completeBtn = document.createElement('button');
      completeBtn.textContent = '☑️';
      completeBtn.title = 'Mark as complete';
      completeBtn.style.background = 'none';
      completeBtn.style.border = 'none';
      completeBtn.style.cursor = 'pointer';
      completeBtn.style.fontSize = '18px';
      completeBtn.style.color = '#4caf50';
      completeBtn.style.opacity = timerData.completed ? '1' : '0.7';
      completeBtn.disabled = timerData.completed;
      completeBtn.onclick = (e) => {
        e.stopPropagation();
        if (!this.timers[timerId].completed) {
          this.timers[timerId].completed = true;
          this.timers[timerId].isRunning = false;
          this.updateTimersPanel();
        }
      };
      // Insert completeBtn in the row (e.g., after label)
      const labelSpan = timerDiv.querySelector('span.timer-label');
      if (labelSpan) {
        const span = document.createElement('span');
        span.style.marginRight = '6px';
        span.appendChild(completeBtn);
        labelSpan.parentNode.insertBefore(span, labelSpan.nextSibling);
      }
      list.appendChild(timerDiv);
    });
    // If dragging to empty space at bottom, allow drop there
    list.ondragover = (e) => {
      if (!this.draggedTimerId) return;
      e.preventDefault();
      if (list.children.length === 0 || (this.dropIndicator && this.dropIndicator.parentNode !== list)) {
        if (this.dropIndicator) this.dropIndicator.remove();
        this.dropIndicator = createDropIndicator();
        list.appendChild(this.dropIndicator);
        dropIndicatorIdx = list.children.length;
      }
    };
    list.ondrop = (e) => {
      if (this.dropIndicator) {
        this.dropIndicator.remove();
        this.dropIndicator = null;
      }
    };
    // Update minimize/maximize button icon
    const minBtn = document.getElementById('timers-minimize-btn');
    if (minBtn) {
      minBtn.textContent = this.minimized ? '▲' : '▼';
    }
    // Sticky header solid background
    const header = document.getElementById('timers-header');
    if (header) {
      header.style.background = '#fff';
      header.style.opacity = '1';
      header.style.backdropFilter = 'none';
      header.style.zIndex = '10';
    }
    // Show/hide load more button
    const loadMoreBtn = document.getElementById('timers-load-more-btn');
    if (loadMoreBtn) {
      if (this.minimized) {
        loadMoreBtn.style.display = 'none';
      } else if (timerStrings.length > this.timersToShowCount) {
        loadMoreBtn.style.display = 'block';
      } else {
        loadMoreBtn.style.display = 'none';
      }
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

  createTimerElement(timerId, initialMinutes = 5, label = '', totalSeconds = null) {
    const container = document.createElement('span');
    container.className = 'docs-timer-container';
    container.contentEditable = false;
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.margin = '0 2px';
    container.style.width = '100%';
    container.style.minHeight = '28px';
    container.style.padding = '0';
    
    const timer = document.createElement('span');
    timer.className = 'docs-timer';
    timer.id = timerId;
    timer.style.display = 'flex';
    timer.style.alignItems = 'center';
    timer.style.flex = '1 1 0';
    timer.style.gap = '4px';
    timer.style.width = '100%';
    timer.innerHTML = `
      <span class="timer-display" style="min-width:38px; text-align:right; font-size:13px;">${this.formatTime(totalSeconds !== null ? totalSeconds : initialMinutes * 60)}</span>
      <span class="timer-label" style="color:#ff9800; font-size:12px; margin:0 4px; flex:1 1 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${label ? label : ''}</span>
      <span class="timer-controls" style="display:flex; align-items:center; gap:2px; flex-shrink:0; white-space:nowrap;">
        <button class="timer-btn timer-play" title="Start/Pause" style="font-size:13px; padding:2px 4px;">▶️</button>
        <button class="timer-btn timer-reset" title="Reset" style="font-size:13px; padding:2px 4px;">🔄</button>
        <button class="timer-btn timer-settings" title="Settings" style="font-size:13px; padding:2px 4px;">⚙️</button>
        <button class="timer-btn timer-delete" title="Delete" style="font-size:13px; padding:2px 4px;">❌</button>
      </span>
    `;

    // Initialize timer data
    this.timers.set(timerId, {
      element: timer,
      timeLeft: totalSeconds !== null ? totalSeconds : initialMinutes * 60,
      totalTime: totalSeconds !== null ? totalSeconds : initialMinutes * 60,
      isRunning: false,
      interval: null,
      label: label
    });

    this.setupTimerControls(timer, timerId);
    container.appendChild(timer);
    return container;
  }

  setupTimerControls(timer, timerId) {
    const timerData = this.timers[timerId];
    
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
    const timerData = this.timers[timerId];
    if (!timerData) return;

    if (timerData.isRunning) {
      this.pauseTimer(timerId);
    } else {
      this.startTimer(timerId);
    }
    this.updateTimersPanel();
  }

  startTimer(timerId) {
    // Pause all other timers
    for (const [id, timerData] of Object.entries(this.timers)) {
      if (id !== timerId && timerData.isRunning) {
        this.pauseTimer(id);
      }
    }
    const timerData = this.timers[timerId];
    if (!timerData) return;
    timerData.isRunning = true;
    // Remove direct DOM updates (playBtn, classList, etc.)
    if (timerData.interval) clearInterval(timerData.interval);
    timerData.interval = setInterval(() => {
      timerData.timeLeft--;
      if (timerData.timeLeft <= 0) {
        this.timerFinished(timerId);
      }
      this.updateTimersPanel();
    }, 1000);
    this.updateTimersPanel();
  }

  pauseTimer(timerId) {
    const timerData = this.timers[timerId];
    if (!timerData) return;
    timerData.isRunning = false;
    clearInterval(timerData.interval);
    timerData.interval = null;
    // Remove direct DOM updates (playBtn, classList, etc.)
    this.updateTimersPanel();
  }

  resetTimer(timerId) {
    const timerData = this.timers[timerId];
    if (!timerData) return;
    this.pauseTimer(timerId);
    timerData.timeLeft = timerData.totalTime;
    timerData.completed = false;
    // Remove direct DOM updates (classList, etc.)
    this.updateTimersPanel();
  }

  updateTimerDisplay(timerId) {
    // No-op: all DOM updates handled in updateTimersPanel
  }

  timerFinished(timerId) {
    const timerData = this.timers[timerId];
    if (!timerData) return;
    this.pauseTimer(timerId);
    timerData.isRunning = false;
    timerData.timeLeft = 0;
    timerData.completed = true;
    this.updateTimersPanel();
    // Use blocking alert for completion
    alert(`Timer for "${timerData.label}" has finished!`);
  }

  flashTimer(timerId) {
    // No-op: all DOM updates handled in updateTimersPanel
  }

  showTimerSettings(timerId) {
    const timerData = this.timers[timerId];
    if (!timerData) return;
    const currentMinutes = Math.floor(timerData.totalTime / 60);
    const currentSeconds = timerData.totalTime % 60;
    let promptVal = currentMinutes > 0 && currentSeconds === 0 ? currentMinutes : `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')}`;
    const newVal = prompt(`Set timer duration (minutes, mm:ss, :ss, or 3s/3sec):`, promptVal);
    if (!newVal) return;
    let newTime = 0;
    const trimmed = newVal.trim();
    if (/^:\d{1,2}$/.test(trimmed)) {
      // :ss format
      newTime = parseInt(trimmed.slice(1), 10);
    } else if (/^(\d+)s(ec)?$/.test(trimmed)) {
      // 3s or 3sec
      newTime = parseInt(trimmed, 10);
    } else if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      // mm:ss format
      const [min, sec] = trimmed.split(':').map(Number);
      newTime = min * 60 + sec;
    } else if (/^\d+$/.test(trimmed)) {
      // Just a number, treat as minutes
      newTime = parseInt(trimmed) * 60;
    } else {
      alert('Invalid format. Use minutes (e.g. 2), mm:ss (e.g. 0:30), :ss (e.g. :05), or 3s/3sec.');
      return;
    }
    if (newTime > 0) {
      timerData.totalTime = newTime;
      timerData.timeLeft = newTime;
      timerData.completed = false;
      this.updateTimersPanel();
    }
  }

  deleteTimer(timerId) {
    if (!this.timers[timerId]) return;
    this.pauseTimer(timerId);
    delete this.timers[timerId];
    // Remove from timerOrder
    this.timerOrder = this.timerOrder.filter(id => id !== timerId);
    // Decrease visible count if needed
    this.timersToShowCount = Math.max(0, this.timersToShowCount - 1);
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

  // Helper to get timers in user order
  getOrderedTimers() {
    const all = Array.from(this.timers.entries());
    // If no order, return as is
    if (!this.timerOrder.length) return all;
    // Sort by order, then append any new timers
    const orderMap = new Map(this.timerOrder.map((id, idx) => [id, idx]));
    all.sort((a, b) => {
      const ai = orderMap.has(a[0]) ? orderMap.get(a[0]) : 9999;
      const bi = orderMap.has(b[0]) ? orderMap.get(b[0]) : 9999;
      return ai - bi;
    });
    return all;
  }

  // When adding a new timer, add its ID to timerOrder if not present
  scanAndUpdateTimers() {
    // Always reset to 5 timers on page load/refresh
    this.timersToShowCount = 5;
    // Reset timerOrder to doc order
    const timerStrings = this.findTimerStringsInDoc();
    this.timerOrder = timerStrings.map(t => t.id);
    this.updateTimersPanel();
  }

  scanForTimers() {
    // On full page load, only show the top 5 timers
    const timerStrings = this.findTimerStringsInDoc();
    this.allTimers = timerStrings; // Store all found timers
    this.timers = new Map();
    for (let i = 0; i < Math.min(this.timersToShowCount, timerStrings.length); ++i) {
      const t = timerStrings[i];
      this.timers.set(t.id, {
        ...t,
        completed: false,
        isRunning: false,
      });
    }
    this.timerOrder = Array.from(this.timers.keys());
    this.saveTimers();
    this.updateTimersPanel();
  }

  findTimerStringsInDoc() {
    // Scan the doc for timer strings and return an array of timer objects
    const rects = document.querySelectorAll('svg rect[aria-label]');
    const timeRegex = /\b(\d{1,2}m(in)?|\d{1,2}:\d{2}|\d{1,2}min|\d{1,2}s(ec|econds)?)\b/gi;
    const timers = [];
    const seen = new Set();
    let idx = 0;
    for (let rect of rects) {
      const label = rect.getAttribute('aria-label');
      if (!label || seen.has(label)) continue;
      seen.add(label);
      timeRegex.lastIndex = 0;
      const match = timeRegex.exec(label);
      if (match) {
        // Try to find the first line of the bullet point if this is a multi-line bullet
        let bulletText = null;
        let node = rect;
        while (node && !bulletText) {
          // Look for a parent with aria-label (the bullet's first line)
          if (node !== rect && node.getAttribute && node.getAttribute('aria-label')) {
            bulletText = node.getAttribute('aria-label');
          }
          node = node.parentNode;
        }
        let labelSource = bulletText || label;
        // Extract the text before the timer string for the label
        let before = labelSource.slice(0, match.index).replace(/\s+/g, ' ').trim();
        let timerLabel = before.split(' ').slice(0, 5).join(' ');
        if (!timerLabel) timerLabel = labelSource.replace(match[0], '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
        if (!timerLabel) timerLabel = 'Timer';
        let minutes = 0;
        let seconds = 0;
        if (/^\d{1,2}m(in)?$/i.test(match[0])) {
          minutes = parseInt(match[0]);
        } else if (/^\d{1,2}:\d{2}$/.test(match[0])) {
          const [min, sec] = match[0].split(':').map(Number);
          minutes = min;
          seconds = sec;
        } else if (/^\d{1,2}min$/i.test(match[0])) {
          minutes = parseInt(match[0]);
        } else if (/^\d{1,2}s(ec|econds)?$/i.test(match[0])) {
          seconds = parseInt(match[0]);
        }
        let totalSeconds = minutes * 60 + seconds;
        if (totalSeconds > 0) {
          timers.push({
            id: `timer-doc-${idx++}`,
            label: timerLabel,
            time: match[0],
            seconds: totalSeconds,
            timeLeft: totalSeconds,
            totalTime: totalSeconds,
            completed: false,
            isRunning: false
          });
        }
      }
    }
    return timers;
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