// Функция для получения текущих настроек прокси из хранилища
function getCurrentProxySettings(callback) {
  chrome.storage.sync.get(['proxyEnabled', 'predefinedProxy', 'customProxy', 'proxyMode', 'specificSites'], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Ошибка при получении настроек прокси:", chrome.runtime.lastError);
      return;
    }
    callback(data);
  });
}

// Функция для обновления иконки
function updateIcon(isOnline) {
  console.log(`Обновление иконки: ${isOnline ? "online" : "offline"}`);
  const iconPath = isOnline ? {
    "16": "/icons/online_icon16.png",
    "48": "/icons/online_icon48.png",
    "128": "/icons/online_icon128.png"
  } : {
    "16": "/icons/offline_icon16.png",
    "48": "/icons/offline_icon48.png",
    "128": "/icons/offline_icon128.png"
  };

  chrome.action.setIcon({ path: iconPath }, () => {
    if (chrome.runtime.lastError) {
      console.error("Ошибка при обновлении иконки:", chrome.runtime.lastError);
    } else {
      console.log("Иконка успешно обновлена");
    }
  });
}

// Функция для установки прокси
function setProxy() {
  getCurrentProxySettings((data) => {
    if (!data.proxyEnabled) {
      chrome.proxy.settings.clear({ scope: "regular" }, () => {
        if (chrome.runtime.lastError) {
          console.error("Ошибка при отключении прокси:", chrome.runtime.lastError);
          updateProxyStatus("Ошибка при отключении прокси");
        } else {
          updateProxyStatus("Отключено");
          updateIcon(false);
        }
      });
      return;
    }

    let proxyConfig;
    let proxyName = '';

    if (data.predefinedProxy) {
      const { protocol = "http", host, httpPort: port, username, password } = data.predefinedProxy;
      if (!host || !port) {
        updateProxyStatus("Error: Некорректные данные прокси");
        return;
      }
      proxyConfig = { scheme: protocol, host, port, username, password };
      proxyName = data.predefinedProxy.name;
    } else if (data.customProxy) {
      const { host, port, username, password } = data.customProxy;
      if (!host || !port) {
        updateProxyStatus("Error: Некорректные данные прокси");
        return;
      }
      proxyConfig = { scheme: "http", host, port: parseInt(port, 10), username, password };
      proxyName = `${host}:${port}`;
    }

    if (!proxyConfig) {
      updateProxyStatus("Error: Прокси не настроен");
      return;
    }

    const proxyValue = {
      mode: data.proxyMode === 'all' ? "fixed_servers" : "pac_script",
      rules: {
        singleProxy: {
          scheme: proxyConfig.scheme,
          host: proxyConfig.host,
          port: proxyConfig.port,
          username: proxyConfig.username,
          password: proxyConfig.password
        },
        bypassList: []
      }
    };

    if (data.proxyMode === 'specific' && data.specificSites && data.specificSites.length > 0) {
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
      updateIcon(false);
    }, timeout);

    chrome.proxy.settings.set({ value: proxyValue, scope: "regular" }, () => {
      clearTimeout(timeoutHandler);
      if (chrome.runtime.lastError) {
        console.error("Ошибка при установке прокси:", chrome.runtime.lastError);
        updateProxyStatus("Ошибка при установке прокси");
        updateIcon(false);
      } else {
        updateProxyStatus(`Подключено: ${proxyName}`);
        updateIcon(true);
      }
    });
  });
}

// Функция для обновления статуса прокси
function updateProxyStatus(status) {
  chrome.runtime.sendMessage({ type: 'updateStatus', status }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("Сообщение статуса не было доставлено (popup не открыт)");
    } else {
      console.log("Сообщение статуса успешно отправлено");
    }
  });
}

// Слушатель изменений в хранилище
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some(key => ['proxyEnabled', 'predefinedProxy', 'customProxy', 'proxyMode', 'specificSites'].includes(key))) {
    setProxy();
  }
});

// Инициализация при установке расширения
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ proxyEnabled: false, predefinedProxy: null, customProxy: null, proxyMode: 'all', specificSites: [] }, () => {
    if (chrome.runtime.lastError) {
      console.error("Ошибка при инициализации настроек:", chrome.runtime.lastError);
    } else {
      setProxy();
      updateIcon(false);
    }
  });
});