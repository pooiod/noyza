window.Noyza = {
    PluginType: {
        Provider: "provider",
        Theme: "theme"
    }
};

Noyza.extensions.register = function (plugin) {
    if (!plugin) {
        console.error("Plugin is undefined or null");
        return;
    }
    if (!plugin.getInfo || typeof plugin.getInfo !== "function") {
        console.error("Plugin does not have a getInfo method");
        return;
    }
    if (!Object.values(Noyza.PluginType).includes(plugin.getInfo().type)) {
        console.error("Plugin type is unknown");
        return;
    }
};
