const AUTOSAVE_KEY = 'screenshot-studio.autosave.v1'
const LOCAL_STORAGE_KEY = 'kami.screenshot-studio.autosave.v1'
const DATABASE_NAME = 'kami-screenshot-studio'
const DATABASE_VERSION = 1
const STORE_NAME = 'autosaves'

class IndexedDbUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'IndexedDbUnavailableError'
  }
}

let databasePromise: Promise<IDBDatabase> | null = null

const hasIndexedDb = () => typeof indexedDB !== 'undefined' && indexedDB !== null

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise
  if (!hasIndexedDb()) {
    return Promise.reject(new IndexedDbUnavailableError('IndexedDB is unavailable in this browser.'))
  }

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    let request: IDBOpenDBRequest

    const failUnavailable = (error?: unknown) => {
      if (settled) return
      settled = true
      reject(new IndexedDbUnavailableError('IndexedDB could not be opened.', {
        cause: error instanceof Error ? error : undefined,
      }))
    }

    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    } catch (error) {
      failUnavailable(error)
      return
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onerror = () => failUnavailable(request.error)
    request.onblocked = () => failUnavailable(new Error('IndexedDB is blocked by another connection.'))
    request.onsuccess = () => {
      if (settled) {
        request.result.close()
        return
      }
      settled = true
      resolve(request.result)
    }
  })

  databasePromise = pending.catch((error) => {
    databasePromise = null
    throw error
  })
  return databasePromise
}

const readLocalStorage = () => {
  try {
    return window.localStorage.getItem(LOCAL_STORAGE_KEY)
  } catch {
    return null
  }
}

const writeLocalStorage = (serializedProject: string) => {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, serializedProject)
}

const getDatabaseOrFallback = async () => {
  try {
    return { database: await openDatabase(), indexedDb: true as const }
  } catch (error) {
    if (error instanceof IndexedDbUnavailableError) {
      return { database: null, indexedDb: false as const }
    }
    throw error
  }
}

export async function loadAutosavedDocument(): Promise<string | null> {
  const { database, indexedDb } = await getDatabaseOrFallback()
  if (!indexedDb) return readLocalStorage()
  if (!database) return null

  return new Promise<string | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(AUTOSAVE_KEY)

    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
    request.onerror = () => reject(request.error ?? new Error('The local autosave could not be read.'))
  })
}

export async function saveAutosavedDocument(serializedProject: string): Promise<void> {
  const { database, indexedDb } = await getDatabaseOrFallback()
  if (!indexedDb) {
    writeLocalStorage(serializedProject)
    return
  }
  if (!database) return

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(serializedProject, AUTOSAVE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('The local autosave could not be written.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('The local autosave was aborted.'))
  })
}
