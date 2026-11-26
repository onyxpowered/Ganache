import { initializeApp as Init } from 'firebase/app'
import { initializeAuth as Auth, inMemoryPersistence as Memory, signInAnonymously as SignIn } from 'firebase/auth'
import { getDatabase as GetDb } from 'firebase/database'
import Shards from './Shards.json'

export const Open = async () => {
  const Results = await Promise.allSettled(
    Shards.map(async (Config, Index) => {
      if (!Config.databaseURL || !Config.apiKey) throw new Error('Empty')
      const App = Init(Config, `Shard${Index}`)
      await SignIn(Auth(App, { persistence: Memory }))
      return { Index, Db: GetDb(App) }
    })
  )
  return Results.filter((Result) => Result.status === 'fulfilled').map((Result) => Result.value)
}
