import { Template } from './Template.js'

export const Build = (Session) => Template.replace('__SESSION__', () => JSON.stringify({ Id: Session }))
