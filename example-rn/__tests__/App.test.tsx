/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {afterEach, beforeEach, it, jest} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer, {act} from 'react-test-renderer';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('renders correctly', () => {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(<App />);
  });
  act(() => {
    tree?.unmount();
  });
});
