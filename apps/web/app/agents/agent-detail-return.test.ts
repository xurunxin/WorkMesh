import { describe, expect, it } from 'vitest'
import {
  agentDetailHref,
  consumeAgentDetailReturnFocus,
  rememberAgentDetailReturnFocus,
} from './agent-detail-return'

const listUrl = '/agents?tab=agents&name=Orbit&team=team-1&capability=work%3Aread&status=active'

describe('Agent detail return focus history state', () => {
  it('preserves Next history fields and records one encoded detail destination', () => {
    const currentState = { __NA: true, tree: ['agents'], index: 4 }

    const nextState = rememberAgentDetailReturnFocus(currentState, listUrl, 'agent/route')

    expect(nextState).toMatchObject(currentState)
    expect(agentDetailHref('agent/route')).toBe('/agents/agent%2Froute')
    expect(agentDetailHref('agent%2Froute')).toBe('/agents/agent%252Froute')
    expect(nextState).toMatchObject({
      workmeshAgentDetailReturnFocus: {
        agentId: 'agent/route',
        detailHref: '/agents/agent%2Froute',
        listUrl,
      },
    })
  })

  it('consumes an exact visible return target once while preserving unrelated state', () => {
    const state = rememberAgentDetailReturnFocus({ __NA: true, tree: ['agents'] }, listUrl, 'agent/route')

    const result = consumeAgentDetailReturnFocus(state, listUrl, ['agent/route', 'agent/other'])

    expect(result.agentId).toBe('agent/route')
    expect(result.nextState).toEqual({ __NA: true, tree: ['agents'] })
    expect(consumeAgentDetailReturnFocus(result.nextState, listUrl, ['agent/route']).agentId).toBeNull()
  })

  it('does not restore focus for a different list context or a filtered-out Agent', () => {
    const state = rememberAgentDetailReturnFocus({ __NA: true }, listUrl, 'agent/route')

    const otherContext = consumeAgentDetailReturnFocus(
      state,
      '/agents?tab=agents&name=Other&team=team-1&capability=work%3Aread&status=active',
      ['agent/route'],
    )
    const hiddenAgent = consumeAgentDetailReturnFocus(state, listUrl, ['agent/other'])

    expect(otherContext.agentId).toBeNull()
    expect(otherContext.nextState).toEqual({ __NA: true })
    expect(hiddenAgent.agentId).toBeNull()
    expect(hiddenAgent.nextState).toEqual({ __NA: true })
  })

  it('leaves ordinary first visits untouched and discards malformed markers', () => {
    const ordinaryState = { __NA: true, tree: ['agents'] }
    const ordinary = consumeAgentDetailReturnFocus(ordinaryState, listUrl, ['agent/route'])
    const malformed = consumeAgentDetailReturnFocus(
      { ...ordinaryState, workmeshAgentDetailReturnFocus: { agentId: 42, listUrl } },
      listUrl,
      ['agent/route'],
    )

    expect(ordinary).toEqual({ agentId: null, hadMarker: false, nextState: ordinaryState })
    expect(malformed).toEqual({ agentId: null, hadMarker: true, nextState: ordinaryState })
  })
})
