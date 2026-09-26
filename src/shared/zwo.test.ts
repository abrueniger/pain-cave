import { describe, expect, it } from 'vitest'
import { parseZwo } from './zwo'
import { LIBRARY } from './library'

const OVER_UNDER = `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
    <author>Zwift</author>
    <name>Threshold &amp; Friends</name>
    <description>Warm up, 5x (2 min on / 1 min off), cool down.</description>
    <sportType>bike</sportType>
    <category>threshold</category>
    <tags><tag name="INTERVALS"/></tags>
    <workout>
        <Warmup Duration="600" PowerLow="0.25" PowerHigh="0.75" pace="0"/>
        <!-- main set -->
        <IntervalsT Repeat="5" OnDuration="120" OffDuration="60" OnPower="1.05" OffPower="0.55" Cadence="95" CadenceResting="85">
            <textevent timeoffset="10" message="Here we go!"/>
        </IntervalsT>
        <SteadyState Duration="300" Power="0.88"/>
        <Cooldown Duration="300" PowerLow="0.75" PowerHigh="0.4"/>
    </workout>
</workout_file>`

describe('parseZwo', () => {
  it('parses warm-up, intervals, steady and cool-down', () => {
    expect(parseZwo(OVER_UNDER, 'x.zwo')).toEqual({
      name: 'Threshold & Friends',
      unit: 'ftp',
      category: 'Threshold',
      blocks: [
        { type: 'ramp', durationS: 600, startWatts: 25, endWatts: 75 },
        { type: 'intervals', repeat: 5, onS: 120, onWatts: 105, offS: 60, offWatts: 55 },
        { type: 'steady', durationS: 300, watts: 88 },
        { type: 'ramp', durationS: 300, startWatts: 75, endWatts: 40 }
      ]
    })
  })

  it('handles attribute case, PowerLow/High on SteadyState, FreeRide, MaxEffort, Ramp and unknown elements', () => {
    const xml = `﻿<workout_file><sportType>bike</sportType><category>Build</category><workout>
      <steadystate duration='60' powerlow='0.6' powerhigh='0.6'/>
      <SteadyState Duration="30" power="1.2"></SteadyState>
      <FreeRide Duration="120" FlatRoad="1"/>
      <MaxEffort Duration="20"/>
      <Ramp Duration="60" PowerLow="0.5" PowerHigh="0.9"/>
      <Cooldown Duration="120" PowerLow="0.3" PowerHigh="0.6"/>
      <SolidState Duration="99"/>
    </workout></workout_file>`
    expect(parseZwo(xml, 'My Ride.ZWO')).toEqual({
      name: 'My Ride',
      unit: 'ftp',
      category: null,
      blocks: [
        { type: 'steady', durationS: 60, watts: 60 },
        { type: 'steady', durationS: 30, watts: 120 },
        { type: 'steady', durationS: 120, watts: 55 },
        { type: 'steady', durationS: 20, watts: 150 },
        { type: 'ramp', durationS: 60, startWatts: 50, endWatts: 90 },
        { type: 'ramp', durationS: 120, startWatts: 60, endWatts: 30 }
      ]
    })
  })

  it('rejects empty, non-zwo and broken files', () => {
    expect(() => parseZwo('  ', 'a.zwo')).toThrow('empty')
    expect(() => parseZwo('<html><body/></html>', 'a.zwo')).toThrow('Not a Zwift workout')
    expect(() => parseZwo('<workout_file><workout></workout></workout_file>', 'a.zwo')).toThrow('no blocks')
    expect(() => parseZwo('<workout_file><workout><SteadyState Duration="60"/></workout></workout_file>', 'a.zwo'))
      .toThrow('powerlow')
  })
})

describe('library', () => {
  it('has named % FTP workouts with warm-up and cool-down ramps', () => {
    expect(new Set(LIBRARY.map(w => w.name)).size).toBe(LIBRARY.length)
    for (const w of LIBRARY) {
      expect(w).toMatchObject({ unit: 'ftp', category: expect.any(String) })
      expect(w.blocks[0].type).toBe('ramp')
      expect(w.blocks[w.blocks.length - 1].type).toBe('ramp')
    }
  })
})
