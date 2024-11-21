// Функция для получения текущих настроек прокси
function getCurrentProxySettings(callback) {
  chrome.storage.sync.get(['proxyEnabled', 'predefinedProxy', 'customProxy', 'proxyMode', 'specificSites'], callback);
}

// Установка прокси с использованием аутентификации через обработку запросов
function setProxy() {
  getCurrentProxySettings((data) => {
    if (!data.proxyEnabled) {
      chrome.proxy.settings.clear({ scope: "regular" }, () => updateProxyStatus("Отключено"));
      return;
    }

    let proxyConfig;
    let proxyName = '';

    if (data.predefinedProxy) {
      const { protocol = "http", host, httpPort: port, username, password } = data.predefinedProxy;
      if (!host || !port) return updateProxyStatus("Error: Некорректные данные прокси");

      proxyConfig = { scheme: protocol, host, port, username, password };
      proxyName = data.predefinedProxy.name;
    } else if (data.customProxy) {
      const { host, port, username, password } = data.customProxy;
      if (!host || !port) return updateProxyStatus("Error: Некорректные данные прокси");

      proxyConfig = { scheme: "http", host, port: parseInt(port, 10), username, password };
      proxyName = `${host}:${port}`;
    }

    if (proxyConfig) {
      const proxyValue = {
        mode: data.proxyMode === 'all' ? "fixed_servers" : "pac_script",
        rules: {
          singleProxy: { scheme: proxyConfig.scheme, host: proxyConfig.host, port: proxyConfig.port },
          bypassList: []
        }
      };

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

      const timeout = 60000;
      const timeoutHandler = setTimeout(() => {
        updateProxyStatus("Error: Timed Out");
        chrome.proxy.settings.clear({ scope: "regular" });
      }, timeout);

      chrome.proxy.settings.set({ value: proxyValue, scope: "regular" }, () => {
        clearTimeout(timeoutHandler);
        updateProxyStatus(`Подключено: ${proxyName}`);
      });
    }
  });
}

// Обновление статуса
function updateProxyStatus(status) {
  chrome.runtime.sendMessage({ type: 'updateStatus', status }, () => {
    if (chrome.runtime.lastError) console.log("Ошибка при отправке сообщения статуса");
  });
}

// Слушатель изменений в хранилище
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some(key => ['proxyEnabled', 'predefinedProxy', 'customProxy', 'proxyMode', 'specificSites'].includes(key))) {
    setProxy();
  }
});

// Инициализация при установке
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ proxyEnabled: false, predefinedProxy: null, customProxy: null, proxyMode: 'all', specificSites: [] });
  setProxy();
});
