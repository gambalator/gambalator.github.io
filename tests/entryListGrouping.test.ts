import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadEntryListGroupingState,
  saveEntryListGroupingState,
} from '../src/storage/entryListGrouping'

const STORAGE_KEY = 'gambalator:entry-list-grouping:v1'

describe('entry-list grouping storage', () => {
  beforeEach(() => localStorage.clear())

  it('enables Auto by default for a new grouping state', () => {
    expect(loadEntryListGroupingState()).toEqual({
      autoMerge: true,
      groups: [],
      exclusions: [],
    })
  })

  it('round-trips groups, Auto state, and exclusions', () => {
    const state = {
      autoMerge: true,
      groups: [{
        id: 'manual:a:b',
        memberIds: ['a', 'b'],
        automatic: false,
        name: 'Team',
      }],
      exclusions: ['c', 'd'],
    }

    saveEntryListGroupingState(state)

    expect(loadEntryListGroupingState()).toEqual(state)
  })

  it('falls back safely when stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')

    expect(loadEntryListGroupingState()).toEqual({
      autoMerge: true,
      groups: [],
      exclusions: [],
    })
  })

  it('rejects invalid or duplicate group members', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      autoMerge: true,
      groups: [{
        id: 'manual:a:a',
        memberIds: ['a', 'a'],
        automatic: false,
        name: 'Broken',
      }],
      exclusions: [],
    }))

    expect(loadEntryListGroupingState()).toEqual({
      autoMerge: true,
      groups: [],
      exclusions: [],
    })
  })
})
