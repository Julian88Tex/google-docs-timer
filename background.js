chrome.commands.onCommand.addListener((command) => {
  console.log(`Command received: ${command}`);
  if (command === "add_timer") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        console.log(`Sending 'addTimer' message to tab ${tabs[0].id}`);
        chrome.tabs.sendMessage(tabs[0].id, { action: "addTimer" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError.message);
          } else {
            console.log('Message sent successfully, response:', response);
          }
        });
      } else {
        console.log("Could not find an active tab to send the message to.");
      }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'showPanel' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message:', chrome.runtime.lastError.message);
    } else {
      console.log('Show panel message sent successfully, response:', response);
    }
  });
}); 