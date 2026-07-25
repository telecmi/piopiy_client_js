const noop = () => undefined;
const track = {stop: noop};

const mediaDevices = {
  getUserMedia: () =>
    Promise.resolve({
      getTracks: () => [track],
    }),
};

module.exports = {
  mediaDevices,
  registerGlobals: noop,
};
