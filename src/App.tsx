import './App.css'

const GRID_SIZE = 16
const PROPAGATION_SPEED = 50

const buildItemClass = (i: number, j: number) => `item-${i}-${j}`
const buildNeighborClass = (i: number, j: number) => `neighbor-${i}-${j}`
const buildSecondNeighborClass = (i: number, j: number) => `second-neighbor-${i}-${j}`

const animate = (i: number, j: number) => {
  const item = document.querySelector('.' + buildItemClass(i, j))
  const itemNeighbors = document.querySelectorAll('.' + buildNeighborClass(i, j))
  const itemSecondNeighbors = document.querySelectorAll('.' + buildSecondNeighborClass(i, j))

  item?.classList.add('active-item')
  setTimeout(() => itemNeighbors.forEach(neighbor => neighbor.classList.add('active-neighbor')), PROPAGATION_SPEED)
  setTimeout(() => itemSecondNeighbors.forEach(secondNeighbor => secondNeighbor.classList.add('active-second-neighbor')), PROPAGATION_SPEED * 2)

  setTimeout(() => item?.classList.remove('active-item'), PROPAGATION_SPEED * 3)
  setTimeout(() => itemNeighbors.forEach(neighbor => neighbor.classList.remove('active-neighbor')), PROPAGATION_SPEED * 4)
  setTimeout(() => itemSecondNeighbors.forEach(secondNeighbor => secondNeighbor.classList.remove('active-second-neighbor')), PROPAGATION_SPEED * 5)
}

function Grid() {
  const onClick = (i: number, j: number) => () => animate(i, j)

  const generateInnerGrid = () => {
    const gridItems = []

    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const classNames = []
        classNames.push('grid-item')
        classNames.push(buildItemClass(i, j))

        // Assign secondary neighbor classNames
        for (let m = i - 2; m <= i + 2; m++) {
          for (let n = j - 2; n <= j + 2; n++) {
            // we don't want to label ourselves as a neighbor to ourselves
            if (m === i && n === j) continue

            classNames.push(buildSecondNeighborClass(m, n))
          }
        }

        // Assign immediate neighbor classNames
        for (let m = i - 1; m <= i + 1; m++) {
          for (let n = j - 1; n <= j + 1; n++) {
            // we don't want to label ourselves as a neighbor to ourselves
            if (m === i && n === j) continue
            classNames.push(buildNeighborClass(m, n))

            // Second neighbor classes were added to all around, so here we remove them.
            const index = classNames.findIndex(cn => cn === buildSecondNeighborClass(m, n))
            classNames.splice(index, 1)
          }
        }

        const key = `${i}-${j}`

        gridItems.push(
          <div key={key} className={classNames.join(' ')} onClick={onClick(i, j)}>{}</div>
        )
      }
    }

    return gridItems
  }

  return (
    <div className='grid-container'>
      {generateInnerGrid()}
    </div>
  )
}

function App() {
  return (
    <div className="App">
      <Grid />
    </div>
  );
}

export default App
