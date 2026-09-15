import { useEffect } from 'react'
import { supabase } from './lib/supabase'

export default function App() {
  // M0 acceptance test: the console shows `scenes: 12`.
  useEffect(() => {
    supabase
      .from('scenes')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) console.error('scenes query failed:', error.message)
        else console.log(`scenes: ${count}`)
      })
  }, [])

  return null
}
