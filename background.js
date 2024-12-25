// Функция для получения текущих настроек прокси из хранилища
function getCurrentProxySettings(callback) {
  chrome.storage.sync.get(['proxyEnabled', 'predefinedProxy', 'customProxy', 'proxyMode', 'specificSites'], callback);
}

// Функция для установки прокси
function setProxy() {
  getCurrentProxySettings((data) => {
    // Если прокси отключен, очищаем настройки
    if (!data.proxyEnabled) {
      chrome.proxy.settings.clear({ scope: "regular" }, () => updateProxyStatus("Отключено"));
      return;
    }

    let proxyConfig;
    let proxyName = '';

    // Настройка для предустановленного прокси
    if (data.predefinedProxy) {
      const { protocol = "http", host, httpPort: port, username, password } = data.predefinedProxy;
      if (!host || !port) return updateProxyStatus("Error: Некорректные данные прокси");

      proxyConfig = { scheme: protocol, host, port, username, password };
      proxyName = data.predefinedProxy.name;
    } 
    // Настройка для пользовательского прокси
    else if (data.customProxy) {
      const { host, port, username, password } = data.customProxy;
      if (!host || !port) return updateProxyStatus("Error: Некорректные данные прокси");

      proxyConfig = { scheme: "http", host, port: parseInt(port, 10), username, password };
      proxyName = `${host}:${port}`;
    }

    if (proxyConfig) {
      // Создание конфигурации для прокси
      const proxyValue = {
        mode: data.proxyMode === 'all' ? "fixed_servers" : "pac_script",
        rules: {
          singleProxy: { scheme: proxyConfig.scheme, host: proxyConfig.host, port: proxyConfig.port },
          bypassList: []  // Список исключений для прокси
        }
      };

      // Если режим прокси специфический для определённых сайтов
      if (data.proxyMode === 'specific' && data.specificSites.length > 0) {
        proxyValue.pacScript = {
          data: `
            function FindProxyForURL(url, host) {
              const sites = ${JSON.stringify(data.specificSites.map(site => `*://${site}/*`))};
              return sites.some(pattern => shExpMatch(url, pattern)) ? "PROXY ${proxyConfig.host}:${proxyConfig.port}" : "DIRECT";
            }
          `
        };
      }

      // Устанавливаем таймаут для подключения прокси
      const timeout = 60000;
      const timeoutHandler = setTimeout(() => {
        updateProxyStatus("Error: Timed Out");
        chrome.proxy.settings.clear({ scope: "regular" });
      }, timeout);

      // Установка прокси
      chrome.proxy.settings.set({ value: proxyValue, scope: "regular" }, () => {
        clearTimeout(timeoutHandler);
        updateProxyStatus(`Подключено: ${proxyName}`);
      });
    }
  });
}

// Функция для обновления статуса прокси
function updateProxyStatus(status) {
  chrome.runtime.sendMessage({ type: 'updateStatus', status }, () => {
    if (chrome.runtime.lastError) console.log("Ошибка при отправке сообщения статуса");
  });
}

// Слушатель изменений в хранилище
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some(key => ['proxyEnabled', 'predefinedProxy', 'customProxy', 'proxyMode', 'specificSites'].includes(key))) {
    setProxy();  // Перезапускаем настройку прокси при изменении данных
  }
});

// Инициализация при установке расширения
chrome.runtime.onInstalled.addListener(() => {
  // Устанавливаем начальные значения в хранилище
  chrome.storage.sync.set({ proxyEnabled: false, predefinedProxy: null, customProxy: null, proxyMode: 'all', specificSites: [] });
  setProxy();  // Устанавливаем прокси с учетом начальных настроек
});
