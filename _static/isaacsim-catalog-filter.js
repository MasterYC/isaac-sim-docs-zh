// Filter Learn collection tiles and the cards or series inside their drawers.
// Both levels use the same rendered tag metadata, so the controls stay in sync
// as the catalog evolves.
(function () {
  "use strict";

  var deprecatedTag = "deprecated";
  var allowedTopicTags = ["robot", "sensor", "physics"];
  var allowedTypeTags = ["tutorial", "tool reference", "developer reference"];
  var filterTagKeys = [deprecatedTag].concat(allowedTopicTags, allowedTypeTags);
  var paramNames = {
    topic: "catalog-topic",
    type: "catalog-type",
    deprecated: "catalog-deprecated",
  };

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
      return;
    }
    callback();
  }

  function directCollectionCards(grid) {
    return Array.prototype.filter.call(grid.children, function (child) {
      return child.classList.contains("isaacsim-collection-card");
    });
  }

  function tagKey(label) {
    return label.trim().toLocaleLowerCase();
  }

  function tagClass(key) {
    return "isaacsim-catalog-tag--" + key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function tagsFor(element) {
    var tags = (element.getAttribute("data-catalog-tags") || "")
      .split(",")
      .map(function (tag) { return tag.trim(); })
      .filter(Boolean);
    element.querySelectorAll(".isaacsim-card-tag").forEach(function (tag) {
      var label = tag.textContent.trim();
      if (label) tags.push(label);
    });
    return unique(tags);
  }

  function normalizedTagsFor(element) {
    var tags = tagsFor(element).map(tagKey);
    filterTagKeys.forEach(function (key) {
      if (element.classList.contains(tagClass(key))) tags.push(key);
    });
    return unique(tags);
  }

  function stateFromURL(topicLabelsByKey, typeLabelsByKey, paramNames) {
    var params = new URL(window.location.href).searchParams;
    var selectedTopic = (params.get(paramNames.topic) || "").trim().toLocaleLowerCase();
    var selectedType = (params.get(paramNames.type) || "").trim().toLocaleLowerCase();
    return {
      selectedTopic: topicLabelsByKey.has(selectedTopic) ? selectedTopic : "",
      selectedType: typeLabelsByKey.has(selectedType) ? selectedType : "",
      showDeprecated: params.get(paramNames.deprecated) === "1",
    };
  }

  function syncURL(selectedTopic, selectedType, showDeprecated, paramNames, method) {
    var url = new URL(window.location.href);
    url.searchParams.delete(paramNames.topic);
    url.searchParams.delete(paramNames.type);
    url.searchParams.delete(paramNames.deprecated);
    if (selectedTopic) url.searchParams.set(paramNames.topic, selectedTopic);
    if (selectedType) url.searchParams.set(paramNames.type, selectedType);
    if (showDeprecated) url.searchParams.set(paramNames.deprecated, "1");

    var nextURL = url.pathname + url.search + url.hash;
    var currentURL = window.location.pathname + window.location.search + window.location.hash;
    if (nextURL === currentURL) return;
    window.history[method + "State"](window.history.state, "", nextURL);
  }

  function collectionLink(card) {
    if (card.matches("a[href]")) return card;
    return card.querySelector("a.isaacsim-collection-card-link[href]");
  }

  function collectionHash(card) {
    var link = collectionLink(card);
    if (!link) return "";
    try {
      return new URL(link.getAttribute("href"), document.baseURI).hash;
    } catch (error) {
      return "";
    }
  }

  function targetedCard(cards) {
    var hash = window.location.hash;
    if (!hash) return null;
    return cards.find(function (card) {
      return collectionHash(card) === hash;
    }) || null;
  }

  function drawerFor(card) {
    var hash = collectionHash(card);
    return hash ? document.getElementById(hash.slice(1)) : null;
  }

  function drawerItems(drawer) {
    if (!drawer) return [];
    var drawerOwner = drawer.matches(".isaacsim-target-section--drawer")
      ? drawer
      : drawer.closest(".isaacsim-target-section--drawer");
    return Array.from(drawer.querySelectorAll(".isaacsim-catalog-item, .isaacsim-compact-card")).filter(function (item) {
      var owner = item.closest(".isaacsim-target-section--drawer");
      return !owner || !drawerOwner || owner === drawerOwner;
    });
  }

  function itemTags(item, collectionTags) {
    var tags = normalizedTagsFor(item);
    // Older single-catalog pages do not need generated item scopes: every
    // drawer item inherits its owning collection's topic and status tags.
    if (!item.classList.contains("isaacsim-catalog-item")) {
      tags = tags.concat(collectionTags);
    }
    return unique(tags);
  }

  function setItemVisible(item, visible) {
    item.hidden = !visible;
    var column = item.closest(".sd-col");
    if (column) column.hidden = !visible;
  }

  function collapseEmptyCardGrids(drawer) {
    if (!drawer) return;
    drawer.querySelectorAll(".sd-container-fluid").forEach(function (container) {
      var items = drawerItems(container);
      if (items.length) {
        container.hidden = items.every(function (item) { return item.hidden; });
      }
    });
  }

  function clearHash() {
    var oldURL = window.location.href;
    var nextURL = window.location.pathname + window.location.search;
    window.history.replaceState(window.history.state, "", nextURL);

    var event;
    try {
      event = new HashChangeEvent("hashchange", {
        oldURL: oldURL,
        newURL: window.location.href,
      });
    } catch (error) {
      event = document.createEvent("Event");
      event.initEvent("hashchange", false, false);
    }
    window.dispatchEvent(event);
  }

  function makeElement(tagName, className, attributes) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    Object.keys(attributes || {}).forEach(function (name) {
      element.setAttribute(name, attributes[name]);
    });
    return element;
  }

  function addChoiceGroup(form, label, ariaLabel, groupAttribute, buttonAttribute, allowedKeys, labelsByKey) {
    if (!labelsByKey.size) return [];

    var buttons = [];
    var group = makeElement("div", "isaacsim-chip-list sd-align-minor-center", {
      role: "group",
      "aria-label": ariaLabel,
    });
    group.setAttribute(groupAttribute, "");
    var groupLabel = makeElement("span", "isaacsim-meta", {});
    groupLabel.textContent = label;
    group.appendChild(groupLabel);

    function addButton(key, buttonLabel) {
      var button = makeElement("button", "isaacsim-chip isaacsim-chip--button isaacsim-chip--strong", {
        type: "button",
        "aria-pressed": key ? "false" : "true",
      });
      button.setAttribute(buttonAttribute, key);
      if (buttonAttribute === "data-catalog-topic") {
        button.setAttribute("data-catalog-tag-filter", key);
      }
      button.textContent = buttonLabel;
      if (!key) button.classList.add("active");
      buttons.push(button);
      group.appendChild(button);
    }

    addButton("", "All");
    allowedKeys.forEach(function (key) {
      if (labelsByKey.has(key)) addButton(key, labelsByKey.get(key));
    });
    form.appendChild(group);
    return buttons;
  }

  function initCatalogFilter(tabs, grid) {
    if (grid.hasAttribute("data-catalog-filter-initialized")) return;

    var cards = directCollectionCards(grid);
    if (!cards.length) return;
    grid.setAttribute("data-catalog-filter-initialized", "");

    var topicLabelsByKey = new Map();
    var typeLabelsByKey = new Map();
    cards.forEach(function (card) {
      var taggedElements = [card].concat(drawerItems(drawerFor(card)));
      taggedElements.forEach(function (element) {
        tagsFor(element).forEach(function (label) {
          var key = label.toLocaleLowerCase();
          if (allowedTopicTags.indexOf(key) !== -1 && !topicLabelsByKey.has(key)) {
            topicLabelsByKey.set(key, label);
          }
          if (allowedTypeTags.indexOf(key) !== -1 && !typeLabelsByKey.has(key)) {
            typeLabelsByKey.set(key, label);
          }
        });
      });
    });

    var form = makeElement(
      "form",
      "isaacsim-surface isaacsim-surface--muted isaacsim-action-row sd-align-minor-center sd-mb-3",
      {
        "data-catalog-filter": "",
        "aria-label": "Filter catalog content",
      }
    );
    form.addEventListener("submit", function (event) { event.preventDefault(); });

    var initialState = stateFromURL(topicLabelsByKey, typeLabelsByKey, paramNames);
    var selectedTopic = initialState.selectedTopic;
    var selectedType = initialState.selectedType;
    var showDeprecated = initialState.showDeprecated;
    var typeButtons = addChoiceGroup(
      form,
      "Content type",
      "Filter catalog content by content type",
      "data-catalog-type-filter",
      "data-catalog-type",
      allowedTypeTags,
      typeLabelsByKey
    );
    var topicButtons = addChoiceGroup(
      form,
      "Topic",
      "Filter catalog content by topic",
      "data-catalog-topic-filter",
      "data-catalog-topic",
      allowedTopicTags,
      topicLabelsByKey
    );

    var deprecatedGroup = makeElement("div", "isaacsim-chip-list sd-align-minor-center", {
      role: "group",
      "aria-label": "Filter catalog content by status",
    });
    var statusLabel = makeElement("span", "isaacsim-meta", {});
    statusLabel.textContent = "Status";
    deprecatedGroup.appendChild(statusLabel);
    var includeDeprecated = makeElement("button", "isaacsim-chip isaacsim-chip--button isaacsim-chip--strong", {
      type: "button",
      "data-catalog-include-deprecated": "",
      "aria-pressed": "false",
    });
    includeDeprecated.textContent = "Include deprecated";
    deprecatedGroup.appendChild(includeDeprecated);
    form.appendChild(deprecatedGroup);

    var clear = makeElement("button", "isaacsim-chip isaacsim-chip--button", {
      type: "button",
      "data-catalog-filter-clear": "",
    });
    clear.textContent = "Clear filters";
    form.appendChild(clear);

    var status = makeElement("output", "isaacsim-meta", {
      "data-catalog-filter-status": "",
      "aria-live": "polite",
      "aria-atomic": "true",
    });
    form.appendChild(status);

    var empty = makeElement("p", "alert alert-info", {
      "data-catalog-filter-empty": "",
      role: "status",
    });
    empty.textContent = "No catalog content matches these filters.";
    empty.hidden = true;

    if (tabs) {
      tabs.insertAdjacentElement("afterend", form);
    } else {
      grid.insertAdjacentElement("beforebegin", form);
    }
    grid.insertAdjacentElement("afterend", empty);

    function applyFilters(clearHiddenTarget) {
      var visibleCount = 0;

      function matches(tags) {
        var isDeprecated = tags.indexOf(deprecatedTag) !== -1;
        var matchesTopic = !selectedTopic || tags.indexOf(selectedTopic) !== -1;
        var matchesType = !selectedType || tags.indexOf(selectedType) !== -1;
        return matchesTopic && matchesType && (showDeprecated || !isDeprecated);
      }

      typeButtons.forEach(function (button) {
        var active = button.getAttribute("data-catalog-type") === selectedType;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      topicButtons.forEach(function (button) {
        var active = button.getAttribute("data-catalog-topic") === selectedTopic;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      includeDeprecated.classList.toggle("active", showDeprecated);
      includeDeprecated.setAttribute("aria-pressed", showDeprecated ? "true" : "false");

      cards.forEach(function (card) {
        var collectionTags = normalizedTagsFor(card);
        var items = drawerItems(drawerFor(card));
        var visible = matches(collectionTags);
        if (items.length) {
          visible = false;
          items.forEach(function (item) {
            var itemVisible = matches(itemTags(item, collectionTags));
            setItemVisible(item, itemVisible);
            if (itemVisible) visible = true;
          });
          collapseEmptyCardGrids(drawerFor(card));
        }
        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      status.textContent = "Showing " + visibleCount + " of " + cards.length + " categories";
      clear.disabled = !selectedTopic && !selectedType && !showDeprecated;
      grid.hidden = visibleCount === 0;
      empty.hidden = visibleCount !== 0;

      var current = targetedCard(cards);
      if (clearHiddenTarget && current && current.hidden) clearHash();
    }

    function revealHashTarget() {
      var current = targetedCard(cards);
      if (current) {
        var collectionTags = normalizedTagsFor(current);
        var items = drawerItems(drawerFor(current));
        var tagSets = items.length
          ? items.map(function (item) { return itemTags(item, collectionTags); })
          : [collectionTags];

        function targetHasMatch(ignoreTopic, ignoreType, ignoreDeprecated) {
          return tagSets.some(function (tags) {
            var matchesTopic = ignoreTopic || !selectedTopic || tags.indexOf(selectedTopic) !== -1;
            var matchesType = ignoreType || !selectedType || tags.indexOf(selectedType) !== -1;
            var matchesStatus = ignoreDeprecated || showDeprecated || tags.indexOf(deprecatedTag) === -1;
            return matchesTopic && matchesType && matchesStatus;
          });
        }

        if (!targetHasMatch(false, false, false) && !showDeprecated && targetHasMatch(false, false, true)) {
          showDeprecated = true;
        }
        if (!targetHasMatch(false, false, false) && selectedTopic && targetHasMatch(true, false, false)) {
          selectedTopic = "";
        }
        if (!targetHasMatch(false, false, false) && selectedType && targetHasMatch(false, true, false)) {
          selectedType = "";
        }
        if (!targetHasMatch(false, false, false)) {
          selectedTopic = "";
          selectedType = "";
          showDeprecated = true;
        }
      }
      applyFilters(false);
      syncURL(selectedTopic, selectedType, showDeprecated, paramNames, "replace");
    }

    function restoreURLState() {
      var state = stateFromURL(topicLabelsByKey, typeLabelsByKey, paramNames);
      selectedTopic = state.selectedTopic;
      selectedType = state.selectedType;
      showDeprecated = state.showDeprecated;
      revealHashTarget();
    }

    function commitState() {
      syncURL(selectedTopic, selectedType, showDeprecated, paramNames, "push");
      applyFilters(true);
    }

    typeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        selectedType = button.getAttribute("data-catalog-type");
        commitState();
      });
    });
    topicButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        selectedTopic = button.getAttribute("data-catalog-topic");
        commitState();
      });
    });
    includeDeprecated.addEventListener("click", function () {
      showDeprecated = !showDeprecated;
      commitState();
    });
    clear.addEventListener("click", function () {
      selectedTopic = "";
      selectedType = "";
      showDeprecated = false;
      commitState();
      (typeButtons[0] || topicButtons[0] || includeDeprecated).focus();
    });
    window.addEventListener("hashchange", revealHashTarget);
    window.addEventListener("popstate", restoreURLState);

    restoreURLState();
  }

  onReady(function () {
    var tabs = Array.from(document.querySelectorAll(".isaacsim-catalog-tabs"));
    var grids = Array.from(document.querySelectorAll(".isaacsim-collection-grid"));
    grids.forEach(function (grid) {
      var precedingTabs = tabs.filter(function (candidate) {
        return candidate.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING;
      });
      var tabStrip = precedingTabs[precedingTabs.length - 1] || null;
      initCatalogFilter(tabStrip, grid);
    });
  });
})();
