const urls = [
  { name: 'Health', url: 'http://localhost:4000/api/health' },
  { name: 'Alumnos', url: 'http://localhost:4000/api/alumnos' },
  { name: 'Representantes', url: 'http://localhost:4000/api/representantes' },
  { name: 'Preinscripciones', url: 'http://localhost:4000/api/preinscripciones' },
  { name: 'Dashboard summary', url: 'http://localhost:4000/api/dashboard/summary' },
  { name: 'Frontend home', url: 'http://localhost:5173/' },
]

async function test() {
  for (const entry of urls) {
    process.stdout.write(`=== ${entry.name} (${entry.url}) ===\n`)
    try {
      const res = await fetch(entry.url)
      const text = await res.text()
      process.stdout.write(`status: ${res.status}\n`)
      process.stdout.write(text.slice(0, 800).replace(/\n/g, ' ') + '\n')
    } catch (err) {
      process.stdout.write(`error: ${err.message}\n`)
    }
    process.stdout.write('\n')
  }
}

test().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
