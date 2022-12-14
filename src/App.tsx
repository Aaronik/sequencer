import './reset.css'
import { useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import './App.scss'
import { GRID_SIZE, PROPAGATION_SPEED, TUNINGS } from './constants'
import Grid from './Grid'
import PlayButton from './PlayButton'
import SettingsButton from './SettingsButton'
import { addAndReleaseClass, buildColumnClass, disableAllGridItems, enableGridItem, getActiveGridItems } from './util'
import SettingsModal from './SettingsModal'
import SaveButton from './SaveButton'
import SaveModal from './SaveModal'
import type Network from '@browser-network/network'
import type Db from '@browser-network/database'
import { buildNetworkAndDb } from './network'
import { DbItem } from './types'
import React from 'react'
import KoFiWidget from './KoFiWidget'
import Copyright from './Copyright'
import { v4 as uuid } from 'uuid'

const IS_MOBILE_APP = window.location.search === "?mobile-app"

const container = () => document.querySelector('.grid')!

const animate = (i: number, j: number) => {
  addAndReleaseClass(container(), `active-item-${i}-${j}`, 0, PROPAGATION_SPEED * 1.5)
  addAndReleaseClass(container(), `active-neighbor-${i}-${j}`, PROPAGATION_SPEED, PROPAGATION_SPEED * 2)
  addAndReleaseClass(container(), `active-second-neighbor-${i}-${j}`, PROPAGATION_SPEED * 1.5, PROPAGATION_SPEED * 2.5)
}

const removeAllActiveColumns = () => {
  for (let i = 0; i < GRID_SIZE; i++) {
    container().classList.remove(`column-${i}-active`)
  }
}

const sound = (row: number, synth: Tone.PolySynth, notes: string[]) => {
  synth.triggerAttackRelease(notes[row], "8n", Tone.now())
}

const playColumn = (column: number, synth: Tone.PolySynth, tuning: keyof typeof TUNINGS) => {
  // Remove the previous column that was played
  const prevColumn = column - 1 < 0 ? GRID_SIZE - 1 : column - 1
  container().classList.remove(`column-${prevColumn}-active`)

  // Add the top level class, for which we have (lots of) lower level css rules
  container().classList.add(`column-${column}-active`)

  const playingItems = document.querySelectorAll('.enabled.' + buildColumnClass(column)) as NodeListOf<HTMLElement>

  playingItems.forEach(item => {
    const i = +(item.dataset.i as string)
    const j = +(item.dataset.j as string)
    animate(i, j)
    sound(i, synth, TUNINGS[tuning].notes)
  })
}

const useEvent = (event: string, listener: (e: Event) => void, passive = false) => {
  useEffect(() => {
    // initiate the event handler
    window.addEventListener(event, listener, passive)

    // this will clean up the event every time the component is re-rendered
    return function cleanup() {
      window.removeEventListener(event, listener)
    }
  })
}

let column = 0
let isToneInitialized = false
let synth: Tone.PolySynth

type Net = {
  network?: Network
  db?: Db<DbItem>
}
const net: Net = {

}

const getLocallyStoredNetworkSecret = () => localStorage?.getItem('browser-network-secret') || ''
const setNetworkSecretLocally = (secret: string) => localStorage?.setItem('browser-network-secret', secret)

const DEFAULT_DB_ITEM: DbItem = {
  id: uuid(),
  name: "",
  saves: [],
  blocks: []
}

const validateDbItem = (dbItem: DbItem): boolean => {
  if (!dbItem) return false
  if (!dbItem.id) return false
  if (typeof dbItem.name !== 'string') return false
  if (!Array.isArray(dbItem.saves)) return false

  for (let save of dbItem.saves) {
    if (!save.id) return false
    if (typeof save.name !== 'string') return false
    if (!save.tuning) return false
    if (typeof save.tempo !== 'number') return false
    if (!Array.isArray(save.activeGridItems)) return false

    for (let gridItem of save.activeGridItems) {
      if (!Number.isSafeInteger(gridItem.i)) return false
      if (!Number.isSafeInteger(gridItem.j)) return false
    }
  }

  return true
}

// TODO
// * Remove github icon if this is an app
// * Get folks to test it out

// A note on play timing.
// I tried:
// * Setting a new setTimeout on each invocation of play, but this made
// the browser stutter pretty bad. It didn't sound good.
// * I was really stoked to try Tone.Transport, as it has bpm rampup
// and swing, but it was all the heck over the place. setInterval was
// drastically more smooth. It also made the browser stutter. I suspect under
// the hood it uses setTimeout repeatedly like I tried.
function App() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [tempo, setTempo] = useState(150)
  const [tuning, setTuning] = useState<keyof typeof TUNINGS>('maj5')
  const [secret, setSecret] = useState(getLocallyStoredNetworkSecret())
  const [numConnections, setNumConnections] = useState(0)
  const [dbItems, setDbItems] = useState<DbItem[]>([])
  const [ourDbItem, setOurDbItem] = useState<DbItem>()
  const playbackInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const signIn = (secret: string) => {
    setNetworkSecretLocally(secret)
    setSecret(secret)
    const [network, db] = buildNetworkAndDb(secret)
    net.network = network
    net.db = db
    updateDbItems()
    network.on('add-connection', updateConnections)
    network.on('destroy-connection', updateConnections)
  }

  useEffect(() => {
    // The thinking here is that this means specifically that we've opened
    // the page with a secret already in localStorage
    if (secret && !net.network) {
      signIn(secret)
    }
  }, [secret])


  // We need to do this every render in order for updateDbItems to see
  // the state objects that appear to be lexically scoped above
  useEffect(() => {
    net.db?.onChange(updateDbItems)
    return () => net.db?.removeChangeHandlers()
  })

  const signOut = () => {
    setNetworkSecretLocally("")
    setSecret("")
    setNumConnections(0)
    setOurDbItem(undefined)
    setDbItems([])
    net.network!.removeListener('add-connection', updateConnections)
    net.network!.removeListener('destroy-connection', updateConnections)
    net.db!.removeChangeHandlers()
    net.network!.teardown()
    delete net.network
    delete net.db
  }

  const serializeState = (): DbItem['saves'][number] => {
    return {
      id: uuid(),
      name: "",
      tuning: tuning,
      tempo: tempo,
      activeGridItems: getActiveGridItems()
    }
  }

  const setSerializedState = (save: DbItem['saves'][number]) => {
    const tuning = save.tuning as keyof typeof TUNINGS
    if (TUNINGS[tuning]) {
      setTuning(tuning)
    }
    setTempo(save.tempo)
    disableAllGridItems()
    save.activeGridItems.forEach(item => {
      enableGridItem(item.i, item.j)
    })
  }

  const bps = tempo / 60
  const playInterval = 500 / bps

  const startPlay = async () => {
    if (!isToneInitialized) {
      await Tone.start()
      isToneInitialized = true
      synth = new Tone.PolySynth(Tone.Synth).toDestination()
    }

    playColumn(column, synth, tuning)
    playbackInterval.current = setInterval(() => {
      column = (column + 1) % (GRID_SIZE)
      playColumn(column, synth, tuning)
    }, playInterval)
  }

  // If the tempo or tuning changes, this is how we keep this playing and
  // switch. It's not perfect but it's good enough.
  useEffect(() => {
    if (!isPlaying) { return }
    stopPlay(false)
    startPlay()
  }, [tempo, tuning])

  const updateConnections = () => setNumConnections(net.network?.activeConnections.length || 0)

  const updateDbItems = () => {
    if (!net.db) return
    let items = net.db.getAll().map(i => i.state)
    items = items.filter(validateDbItem)
    setDbItems(items)

    // This is our state
    const ours = net.db.get(net.db.publicKey)?.state
    if (!ours || !validateDbItem(ours)) { return }

    // Now we handle what happens when an item comes in that's ours

    // In the case of someone having logged in with an existing account with
    // a new device, and they already added a name, say, or even some saves, we
    // need to make sure we don't overwrite their old saves, so we'll merge them.
    //
    // Note that this is only going to work some of the time, because if our state
    // gets out to the other guy first, they'll overwrite their version of ours before
    // they have a chance to send it over. This has been "solved" with a user message.
    if (ourDbItem && ours.id !== ourDbItem?.id) {
      ourDbItem.saves.push(...ours.saves)
      const allSaves = ourDbItem.saves.concat(ours.saves)
      const seenSaves: { [id: string]: true } = {}
      // Unique them
      ourDbItem.saves = allSaves.filter(save => {
        const hasSeen = seenSaves[save.id]
        seenSaves[save.id] = true
        return !hasSeen
      })
    }

    setOurDbItem(ours)

    // It's not really optional but there's already state in the network without these!
    ours.blocks?.forEach(block => {
      net.db!.deny(block.address)
    })
  }

  const stopPlay = (shouldResetColumn = true) => {
    if (shouldResetColumn) column = 0
    clearInterval(playbackInterval.current!)
    removeAllActiveColumns()
  }

  const togglePlay = () => {
    if (isPlaying) stopPlay()
    else startPlay()
    setIsPlaying(!isPlaying)
  }

  /**
  * @description Note that personId here is _not_ the db/network's address
  * space, it's the id we randomly assign within each person's state, ie
  * DbItem['id']
  */
  const onBlockPerson = (address: string) => {
    const item = dbItems.find(item => item.id === address)
    if (!item) { return console.warn('Tried to block person we couldn\'t find') }
    const wrappedDbItem = net.db!.getAll().find(wrapped => wrapped.state.id === address)
    if (!wrappedDbItem) { return console.warn('Tried to block person we couldn\'t find') }

    let ourNewItem: DbItem
    if (!ourDbItem) {
      ourNewItem = { ...DEFAULT_DB_ITEM }
    } else {
      ourNewItem = ourDbItem
    }

    // We have to handle this because the network is already populated with state without blocks
    if (!ourNewItem.blocks) ourNewItem.blocks = []
    ourNewItem.blocks.push({
      name: item.name,
      address: wrappedDbItem.publicKey
    })
    net.db!.deny(wrappedDbItem.publicKey)
    net.db!.set(ourNewItem)
  }

  const onUndenyPerson = (address: string) => {
    net.db?.undeny(address)
    ourDbItem!.blocks = ourDbItem!.blocks.filter(block => {
      return block.address !== address
    })
    net.db?.set(ourDbItem!)
  }

  useEvent('keydown', (event) => {
    const e = event as KeyboardEvent
    if (e.key === ' ') togglePlay()
    if (e.key === 'Escape') {
      setIsSettingsModalOpen(false)
      setIsSaveModalOpen(false)
    }
  })

  useEvent('click', () => {
    setIsSettingsModalOpen(false)
    setIsSaveModalOpen(false)
  })

  return (
    <>
      <div className="container">
        <SettingsModal
          isOpen={isSettingsModalOpen}
          close={() => setIsSettingsModalOpen(false)}
          tempo={tempo}
          setTempo={setTempo}
          tuning={tuning}
          setTuning={setTuning}
          blocks={ourDbItem?.blocks}
          undeny={onUndenyPerson}
        />
        <SaveModal
          isOpen={isSaveModalOpen}
          close={() => setIsSaveModalOpen(false)}
          needsSecret={!secret}
          setSecret={signIn}
          numConnections={numConnections}
          ourDbItem={ourDbItem || DEFAULT_DB_ITEM}
          dbItems={dbItems}
          saveItem={(item: DbItem) => net.db!.set(item)}
          getSerializedCurrentState={serializeState}
          loadSave={save => {
            setSerializedState(save)
            setIsSaveModalOpen(false)
          }}
          block={onBlockPerson}
          signOut={signOut}
        />
        <Grid activeColor={TUNINGS[tuning].color} />
        <div id="button-row" onClick={e => e.stopPropagation()}>
          <SettingsButton onClick={() => {
            setIsSettingsModalOpen(!isSettingsModalOpen)
            setIsSaveModalOpen(false)
          }} />
          <PlayButton isPlaying={isPlaying} onClick={togglePlay} />
          <SaveButton onClick={() => {
            setIsSaveModalOpen(!isSaveModalOpen)
            setIsSettingsModalOpen(false)
          }} />
        </div>
      </div>
      {/* Not wanting to see the github at the moment, but leaving it in case this was a bad decision */}
      {true || <a id="github" target="_blank" href="https://github.com/aaronik/sequencer"><img src="github.png" /></a>}
      {!IS_MOBILE_APP && <KoFiWidget />}
      <Copyright />
    </>
  );
}

export default App
