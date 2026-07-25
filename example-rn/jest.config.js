module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^piopiyjs$': '<rootDir>/__mocks__/piopiyjs.js',
    '^react-native-callkeep$':
      '<rootDir>/__mocks__/react-native-callkeep.js',
    '^react-native-voip-push-notification$':
      '<rootDir>/__mocks__/react-native-voip-push-notification.js',
    '^react-native-webrtc$': '<rootDir>/__mocks__/react-native-webrtc.js',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    '^@react-native-firebase/messaging$':
      '<rootDir>/__mocks__/@react-native-firebase/messaging.js',
  },
};
