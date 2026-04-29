import React, {
  createContext, useContext,
  useEffect, useState, useCallback
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { T, TKey } from '../constants/translations'
import { getLang } from '../constants/languages'
import { useAppStore } from '../store'

const STORAGE_KEY = '@mandiagent:language'

interface LangCtx {
  code: string
  setCode: (c: string) => Promise<void>
  t: (k: TKey) => string
  lang: ReturnType<typeof getLang>
  isLoaded: boolean
  isFirstLaunch: boolean
}

const Ctx = createContext<LangCtx | null>(null)

export function LanguageProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [code, setCodeState] = useState('en')
  const [isLoaded, setIsLoaded] = useState(false)
  const [isFirstLaunch, setIsFirstLaunch] = useState(true)

  useEffect(() => {
    // Sync with Zustand if it has a saved language
    const zustandLang = useAppStore.getState().preferredLanguage
    if (zustandLang && zustandLang !== 'hi' && zustandLang !== 'en') {
      setCodeState(zustandLang)
      setIsFirstLaunch(false)
    }

    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (saved) {
        setCodeState(saved)
        setIsFirstLaunch(false)
      }
      setIsLoaded(true)
    }).catch(() => {
      setIsLoaded(true)
    })
  }, [])

  const setCode = useCallback(async (newCode: string) => {
    setCodeState(newCode)
    setIsFirstLaunch(false)
    useAppStore.getState().setPreferredLanguage(newCode)
    await AsyncStorage.setItem(STORAGE_KEY, newCode)
  }, [])

  const t = useCallback((key: TKey): string => {
    return T[code]?.[key] ?? T['hi']?.[key] ?? T['en']?.[key] ?? key
  }, [code])

  return (
    <Ctx.Provider value={{
      code,
      setCode,
      t,
      lang: getLang(code),
      isLoaded,
      isFirstLaunch,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLang = () => {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error(
    'useLang must be inside LanguageProvider'
  )
  return ctx
}
