import React, { Component } from 'react'
import { AppRegistry } from 'react-native'
import Everything from './everything'
export default class more extends Component {
  render () {
    return <Everything />
  }
}

AppRegistry.registerComponent('more', () => more)
