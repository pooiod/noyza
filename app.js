window.app = {
    async NeedsUpdate() {
        return false;
    },
    Update() {
        window.location.href = '/update.html';
    },
    async GetFileCount() {
        return 0;
    },
    ClearStorage() {
        indexedDB.deleteDatabase('${dbName}');
        window.location.reload();
    }
};
