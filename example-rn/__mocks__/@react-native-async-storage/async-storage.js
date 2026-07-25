const store = new Map();

module.exports = {
  getItem: key => Promise.resolve(store.get(key) || null),
  setItem: (key, value) => {
    store.set(key, value);
    return Promise.resolve();
  },
  removeItem: key => {
    store.delete(key);
    return Promise.resolve();
  },
};
