(function () {
  const initializedSelectors = new WeakSet();
  const storagePrefix = "isaacsim.configSelector.v1";

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
      return;
    }

    callback();
  }

  function parseSelectorMetadata(selector) {
    const metadata = selector.querySelector(".config-selector-metadata");
    if (!metadata) return {};

    try {
      return JSON.parse(metadata.textContent || "{}");
    } catch (error) {
      console.warn("Error parsing config selector metadata:", error);
      return {};
    }
  }

  function initConfigSelector(selector) {
    if (initializedSelectors.has(selector)) return;
    initializedSelectors.add(selector);

    const selectorScope = selector.dataset.configScope || "default";
    const metadata = parseSelectorMetadata(selector);
    const buttons = Array.from(selector.querySelectorAll(".config-btn"));
    const buttonGroups = Array.from(selector.querySelectorAll(".config-buttons"));
    const metadataKeys = metadata.options ? Object.keys(metadata.options) : [];
    const configKeys = metadataKeys.length
      ? metadataKeys
      : Array.from(new Set(buttonGroups.map((group) => group.dataset.configKey).filter(Boolean)));
    const contents = Array.from(document.querySelectorAll(".config-content")).filter(
      (content) => content.dataset.configScope === selectorScope
    );
    const persistMode = typeof metadata.persist === "string" ? metadata.persist : "";
    const persistKey =
      typeof metadata.persistKey === "string" && metadata.persistKey ? metadata.persistKey : selectorScope;
    const shouldPersist = persistMode === "session";
    let storedConfigCache = null;
    const defaultConfig = {};

    buttonGroups.forEach((group) => {
      const activeButton = group.querySelector(".config-btn.active") || group.querySelector(".config-btn");
      if (activeButton && group.dataset.configKey) {
        defaultConfig[group.dataset.configKey] = activeButton.dataset.value;
      }
    });

    function setActiveButton(button) {
      if (!button || !button.parentNode) return;

      button.parentNode.querySelectorAll(".config-btn").forEach((sibling) => {
        sibling.classList.remove("active");
        sibling.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
    }

    function getCurrentConfig() {
      const config = {};
      buttonGroups.forEach((group) => {
        const row = group.closest(".config-row");
        if (row && row.style.display === "none") return;

        const activeButton = group.querySelector(".config-btn.active");
        if (activeButton) {
          config[group.dataset.configKey] = activeButton.dataset.value;
        }
      });

      return config;
    }

    function getConfigParams() {
      if (!window.URLSearchParams) return new Map();
      return new URLSearchParams(window.location.search);
    }

    function getParamKey(key) {
      return selectorScope === "default" ? key : `${selectorScope}.${key}`;
    }

    function hasConfigParam(params, key) {
      return params.has(getParamKey(key)) || (selectorScope !== "default" && params.has(key));
    }

    function getConfigParamValue(params, key) {
      if (params.has(getParamKey(key))) return params.get(getParamKey(key));
      if (selectorScope !== "default" && params.has(key)) return params.get(key);
      return null;
    }

    function hasConfigUrlParams() {
      const params = getConfigParams();
      return configKeys.some((key) => hasConfigParam(params, key));
    }

    function getStorage() {
      if (!shouldPersist) return null;

      try {
        return window.sessionStorage || null;
      } catch {
        return null;
      }
    }

    function getStorageKey() {
      return `${storagePrefix}.${persistKey}`;
    }

    function isValidConfigValue(key, value) {
      if (!value) return false;

      const group = buttonGroups.find((candidate) => candidate.dataset.configKey === key);
      if (!group) return false;

      return Array.from(group.querySelectorAll(".config-btn")).some((button) => button.dataset.value === value);
    }

    function getStoredConfig() {
      const storage = getStorage();
      if (!storage) return {};
      if (storedConfigCache) return storedConfigCache;

      storedConfigCache = {};
      try {
        const parsed = JSON.parse(storage.getItem(getStorageKey()) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return storedConfigCache;

        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === "string") {
            storedConfigCache[key] = value;
          }
        });
      } catch (error) {
        console.warn("Error parsing stored config selector state:", error);
      }

      return storedConfigCache;
    }

    function getStoredConfigValue(key) {
      const value = getStoredConfig()[key];
      return isValidConfigValue(key, value) ? value : null;
    }

    function hasStoredConfigValues() {
      return shouldPersist && configKeys.some((key) => getStoredConfigValue(key));
    }

    function persistConfig() {
      const storage = getStorage();
      if (!storage) return;

      storedConfigCache = getCurrentConfig();
      storage.setItem(getStorageKey(), JSON.stringify(storedConfigCache));
    }

    function applyConfigFromUrl() {
      const params = getConfigParams();
      const hasUrlParams = hasConfigUrlParams();

      configKeys.forEach((key) => {
        const group = buttonGroups.find((candidate) => candidate.dataset.configKey === key);
        if (!group) return;

        const targetValue = hasConfigParam(params, key)
          ? getConfigParamValue(params, key)
          : hasUrlParams
            ? defaultConfig[key]
            : getStoredConfigValue(key) || defaultConfig[key];
        const targetButton = Array.from(group.querySelectorAll(".config-btn")).find(
          (button) => button.dataset.value === targetValue
        );

        if (targetButton) {
          setActiveButton(targetButton);
        }
      });
    }

    function updateUrlFromConfig() {
      if (!window.URL || !window.history || !window.history.replaceState) return;

      const url = new URL(window.location.href);
      configKeys.forEach((key) => {
        url.searchParams.delete(getParamKey(key));
        if (selectorScope !== "default") {
          url.searchParams.delete(key);
        }
      });

      Object.entries(getCurrentConfig()).forEach(([key, value]) => {
        url.searchParams.set(getParamKey(key), value);
      });

      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }

    function updateRowVisibility() {
      const rows = Array.from(selector.querySelectorAll(".config-row[data-show-when]"));

      for (let i = 0; i <= rows.length; i++) {
        const config = getCurrentConfig();
        let changed = false;

        rows.forEach((row) => {
          try {
            const showWhen = JSON.parse(row.dataset.showWhen || "{}");
            const visible = Object.entries(showWhen).every(([key, value]) => config[key] === value);
            const display = visible ? "" : "none";

            if (row.style.display !== display) {
              row.style.display = display;
              changed = true;
            }
          } catch (error) {
            console.warn("Error parsing data-show-when for row:", error);
          }
        });

        if (!changed) break;
      }
    }

    function updateVisibility() {
      const currentConfig = getCurrentConfig();

      contents.forEach((content) => {
        try {
          const conditions = JSON.parse(content.dataset.conditions || "{}");
          const shouldShow = Object.entries(conditions).every(([key, value]) => currentConfig[key] === value);

          if (shouldShow) {
            content.classList.remove("hidden");
            content.style.display = "block";
          } else {
            content.classList.add("hidden");
            content.style.display = "none";
          }
        } catch (error) {
          console.warn("Error parsing conditions for content block:", error);
        }
      });
    }

    const topElements = [
      document.querySelector(".bd-header-announcement"),
      document.querySelector("#bd-header-version-warning"),
      document.querySelector(".bd-header.navbar"),
    ].filter(Boolean);

    const contentRoot = document.querySelector(".bd-main") || document.querySelector("main") || document.body;

    function updateBannerTop() {
      let bottom = 0;
      topElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom > bottom) bottom = rect.bottom;
      });
      selector.style.top = `${Math.max(0, bottom)}px`;
    }

    function updateContentOffset() {
      if (!contentRoot) return;

      const height = selector.offsetHeight;
      contentRoot.style.paddingTop = `${height}px`;
      document.documentElement.style.scrollPaddingTop = `${height + 16}px`;
    }

    function refreshFromUrl() {
      applyConfigFromUrl();
      updateRowVisibility();
      updateVisibility();
      updateContentOffset();
      updateBannerTop();
    }

    buttons.forEach((button) => {
      button.addEventListener("click", function () {
        setActiveButton(this);
        updateRowVisibility();
        updateVisibility();
        persistConfig();
        updateUrlFromConfig();
      });

      button.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.click();
        }
      });
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        updateContentOffset();
        updateBannerTop();
      }).observe(selector);
    }

    window.addEventListener("resize", () => {
      updateContentOffset();
      updateBannerTop();
    });
    window.addEventListener("scroll", updateBannerTop, { passive: true });
    window.addEventListener("popstate", refreshFromUrl);

    // Keep first-load URLs clean unless the URL or this tab already has selector state.
    const shouldUpdateUrl = hasConfigUrlParams() || hasStoredConfigValues();
    refreshFromUrl();
    if (shouldUpdateUrl) {
      persistConfig();
      updateUrlFromConfig();
    }

    setTimeout(() => {
      updateContentOffset();
      updateBannerTop();
    }, 100);
  }

  onReady(() => {
    document.querySelectorAll(".config-selector").forEach(initConfigSelector);
  });
})();
