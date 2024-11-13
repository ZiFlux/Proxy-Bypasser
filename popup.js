// Функция для проверки валидности JSON строки
function isValidJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

// Загрузка предустановленных прокси из proxies.json
fetch(chrome.runtime.getURL('data/proxies.json'))
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('predefinedProxies');
    if (select) {
      data.predefinedProxies.forEach(proxy => {
        const option = document.createElement('option');
        option.value = JSON.stringify(proxy);
        option.textContent = proxy.name;
        select.appendChild(option);
      });

      chrome.storage.sync.get(['predefinedProxy'], (dataStorage) => {
        if (dataStorage.predefinedProxy) {
          select.value = JSON.stringify(dataStorage.predefinedProxy);
        }
      });
    } else {
      console.error('Element with id "predefinedProxies" not found');
    }
  })
  .catch(error => console.error('Error loading proxies:', error));

// Управление вкладками с добавлением активного класса
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    const tab = button.getAttribute('data-tab');
    
    // Снятие активного класса с других кнопок и вкладок
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Добавление активного класса к выбранной кнопке и вкладке
    button.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
  });
});

// Функция для отображения/скрытия поля для ввода доменов
function toggleSpecificSitesInput() {
  const selectedMode = document.querySelector('input[name="proxyMode"]:checked').value;
  document.getElementById('specificSites').style.display = selectedMode === 'specific' ? 'block' : 'none';
}

// Сохранение настроек при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  const predefinedProxiesSelect = document.getElementById('predefinedProxies');
  const toggleProxyButton = document.getElementById('toggleProxy');
  const specificSitesContainer = document.getElementById('specificSites');
  const sitesListElement = document.getElementById('sitesList');
  const proxyModeRadioButtons = document.querySelectorAll('input[name="proxyMode"]');

  // Инициализация отображения поля при загрузке
  chrome.storage.sync.get(['proxyMode', 'specificSites'], (data) => {
    document.querySelector(`input[name="proxyMode"][value="${data.proxyMode || 'all'}"]`).checked = true;
    toggleSpecificSitesInput();

    if (data.specificSites) {
      sitesListElement.value = data.specificSites.join(', ');
    }
  });

  // Добавление слушателя для переключения режима прокси
  proxyModeRadioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      toggleSpecificSitesInput();
      chrome.storage.sync.set({ proxyMode: radio.value });
    });
  });

  // Сохранение списка сайтов для режима "specific"
  sitesListElement.addEventListener('input', () => {
    const sites = sitesListElement.value.split(',').map(site => site.trim()).filter(site => site);
    chrome.storage.sync.set({ specificSites: sites }, () => {
      console.log('Specific sites updated:', sites);
    });
  });

  // Сохранение выбранного предустановленного прокси
  if (predefinedProxiesSelect) {
    predefinedProxiesSelect.addEventListener('change', (event) => {
      const selectedProxyValue = event.target.value;
      let selectedProxy = null;

      if (selectedProxyValue && isValidJson(selectedProxyValue)) {
        selectedProxy = JSON.parse(selectedProxyValue);
      }

      chrome.storage.sync.set({ predefinedProxy: selectedProxy, customProxy: null }, () => {
        console.log('Predefined proxy selected:', selectedProxy);
        applyProxySettings(selectedProxy);
      });
    });
  } else {
    console.error('Element with id "predefinedProxies" not found');
  }

  // Сохранение пользовательского прокси
  const saveCustomProxyButton = document.getElementById('saveCustomProxy');
  if (saveCustomProxyButton) {
    saveCustomProxyButton.addEventListener('click', () => {
      const proxyInput = document.getElementById('customProxyInput').value.trim();
      const [auth, hostAndPort] = proxyInput.split('@');
      if (auth && hostAndPort) {
        const [username, password] = auth.split(':');
        const [host, port] = hostAndPort.split(':');
        const portInt = parseInt(port, 10);

        if (host && portInt && username && password) {
          const customProxy = { host, port: portInt, username, password };
          chrome.storage.sync.set({ customProxy: customProxy, predefinedProxy: null }, () => {
            alert('Пользовательский прокси сохранен!');
            applyProxySettings(customProxy);
          });
        } else {
          alert('Пожалуйста, убедитесь, что все поля корректно заполнены.');
        }
      } else {
        alert('Введите прокси в формате LOGIN:PASSWORD@IP:PORT.');
      }
    });
  } else {
    console.error('Element with id "saveCustomProxy" not found');
  }

  // Переключение прокси
  if (toggleProxyButton) {
    toggleProxyButton.addEventListener('click', () => {
      chrome.storage.sync.get(['proxyEnabled'], (data) => {
        const newStatus = !data.proxyEnabled;
        chrome.storage.sync.set({ proxyEnabled: newStatus }, () => {
          toggleProxyButton.innerText = newStatus ? 'Disable Proxy' : 'Enable Proxy';
          updateProxyStatus(newStatus ? "Подключение..." : "Отключено");
        });
      });
    });
  }

  // Функция для обновления статуса
  function updateProxyStatus(status) {
    const statusElement = document.getElementById('proxy-status');
    if (statusElement) {
      statusElement.textContent = status;
    }
  }

  // Применение настроек прокси
  function applyProxySettings(proxy) {
    if (proxy) {
      if (proxy.httpPort && !proxy.port) {
        proxy.port = proxy.httpPort;
      }
      if (!proxy.host || !proxy.port) {
        console.error('Invalid proxy settings:', proxy);
        return;
      }

      const proxyConfig = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: proxy.protocol || 'http',
            host: proxy.host,
            port: parseInt(proxy.port, 10)
          },
          bypassList: []
        }
      };

      chrome.proxy.settings.set({ value: proxyConfig, scope: 'regular' }, function () {
        console.log('Proxy settings applied:', proxy);
      });
    } else {
      console.error('Invalid proxy settings:', proxy);
    }
  }

  // Обработка обновления статуса
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'updateStatus') {
      updateProxyStatus(message.status);
    }
  });
});
