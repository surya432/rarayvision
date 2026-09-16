import React from 'react'
import { act, create } from 'react-test-renderer'
import FaceListScreen from '../src/features/facelist/FaceListScreen'

jest.mock('../src/features/facelist/actions/action', () => ({
  getListFaces: jest.fn(() => Promise.resolve()),
}))

describe('FaceListScreen', () => {
  it('renders without crashing', async () => {
    await act(async () => {
      create(<FaceListScreen />)
    })
  })
})
