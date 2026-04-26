import { type NavigateFunction, useNavigate } from 'react-router-dom'

export let globalNavigate: NavigateFunction

const GlobalHistory = () => {
  globalNavigate = useNavigate()

  return null
}

export default GlobalHistory
