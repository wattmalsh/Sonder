// @flow

import { combineReducers } from 'redux'
import configureStore from './CreateStore'
import rootSaga from '../Sagas/'

export default () => {
  /* ------------- Assemble The Reducers ------------- */
  const rootReducer = combineReducers({
    location: require('./LocationRedux').reducer,
    user: require('./UserRedux').reducer,
    // search: require('./SearchRedux').reducer,
    friendsLocations: require('./FriendsLocationsRedux').reducer,
  })

  return configureStore(rootReducer, rootSaga)
}
