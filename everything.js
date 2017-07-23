import React, { Component } from 'react'
import {
  RefreshControl,
  AsyncStorage,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Text,
  View
} from 'react-native'
import QRCode from 'react-native-qrcode'
import Camera from 'react-native-camera'
var randomColor = require('randomcolor') // import the script

class StoredState {
  constructor (params) {
    this.name = params.name
    this.loaded = false
    this._data = {}
  }

  load () {
    return AsyncStorage.getItem(this.name).then(stored => {
      if (stored) {
        try {
          this._data = JSON.parse(stored)
        } catch (e) {
          console.log(e)
        }
      }
      this.loaded = true
    })
  }

  set (k, v) {
    if (!k) throw new Error('attempt to set null key')
    if (!this.loaded) throw new Error('not loaded')
    this._data[k] = v
    return this
  }

  get (k) {
    if (!this.loaded) throw new Error('not loaded')
    return this._data[k]
  }

  save () {
    return AsyncStorage.setItem(this.name, JSON.stringify(this._data))
  }

  clear () {
    this._data = {}
    return this.save()
  }
}

const stored = new StoredState({ name: 'state' })

export default class Everything extends Component {
  constructor (props) {
    super(props)
    this.state = {
      refreshing: false,
      loaded: false,
      edittedName: '',
      currentValue: 0,
      editName: false,
      group: [],
      spinner: false
    }
  }

  query (endpoint, arg, attempts) {
    this.setState({ spinner: true })
    let uuid = stored.get('uuid')
    let path =
      'https://more.run/' + endpoint + '/' + uuid + (arg ? '/' + arg : '')
    console.log(path)
    attempts = attempts || 0
    return fetch(path, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })
      .then(response => {
        setTimeout(() => null, 0) // workaround for https://github.com/facebook/react-native/issues/6679
        return response.json()
      })
      .then(res => {
        this.setState({ spinner: false })
        return res
      })
      .catch(e => {
        if (attempts++ >= 0) {
          this.setState({
            error: 'something went terribly wrong, please restart the application'
          })
        }
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            return resolve(this.query(endpoint, arg, attempts))
          }, 5000)
        })
      })
  }

  getGroupState = () => {
    this.setState({ refreshing: true })
    return this.query('get').then(res => {
      res.sort((a, b) => {
        let lasta = a.events[-1] || { stampMs: 0 }
        let lastb = b.events[-1] || { stampMs: 0 }
        return lastb - lasta
      })
      this.setState({ group: res, refreshing: false })
    })
  }

  componentDidMount () {
    stored.load().then(() => {
      return this.query('makeUser').then(res => {
        return stored
          .set('uuid', res.UUID)
          .set('groupUUID', res.groupUUID)
          .save()
          .then(this.getGroupState)
          .then(() => {
            this.setState({
              loaded: true,
              edittedName: stored.get('name'),
              uuid: res.UUID
            })
          })
      })
    })
  }

  renderMyName () {
    if (!stored.get('name') || this.state.editName) {
      return (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <TextInput
            style={{ height: 40, borderColor: 'gray', borderWidth: 1, flex: 8 }}
            onChangeText={text => this.setState({ edittedName: text })}
            value={this.state.edittedName}
          />
          <TouchableOpacity
            onPress={() => {
              console.log(this.state.name)
              return stored
                .set('name', this.state.edittedName)
                .save()
                .then(() => {
                  return this.query('changeName', this.state.edittedName)
                })
                .then(res => {
                  this.setState({ editName: null })
                })
            }}
          >
            <Text>Save</Text>
          </TouchableOpacity>
        </View>
      )
    } else {
      return (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Text
            style={{ fontSize: 20 }}
            onPress={() => this.setState({ editName: true })}
          >
            {stored.get('name')}
          </Text>

          <Text
            style={{ fontSize: 20 }}
            onPress={() => this.setState({ showQr: true })}
          >
            join/leave
          </Text>

        </View>
      )
    }
  }

  renderSpinner () {
    return (
      <View
        style={[
          styles.container,
          { alignItems: 'center', justifyContent: 'center' }
        ]}
      >
        <ActivityIndicator />
      </View>
    )
  }

  renderError () {
    if (this.state.error) {
      return (
        <View
          style={[
            styles.container,
            {
              alignItems: 'center',
              justifyContent: 'center'
            }
          ]}
        >
          <Text onPress={() => this.setState({ error: null })}>
            {this.state.error}
          </Text>
        </View>
      )
    }
  }

  renderAddSelector () {
    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <TouchableOpacity
          onPress={() =>
            this.setState((prevState, props) => ({
              currentValue: prevState.currentValue + 5
            }))}
          onLongPress={() =>
            this.setState((prevState, props) => ({
              currentValue: prevState.currentValue - 5
            }))}
        >

          <Text
            style={{
              fontSize: 100
            }}
          >
            {this.state.currentValue}
          </Text>
        </TouchableOpacity>
        <Text>{'    '}</Text>
        <TouchableOpacity
          onPress={() => {
            if (this.state.currentValue > 0) {
              this.query('addEvent', this.state.currentValue).then(() => {
                this.setState({ currentValue: 0 })
                return this.getGroupState()
              })
            }
          }}
        >

          <Text
            style={{
              fontSize: 100
            }}
          >
            &gt;
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  renderGroupItem (item) {
    let addedToday = 0
    let addedTotal = 0
    let daySinceEpoch = function (d) {
      return Math.floor(d / 1000 / (3600 * 24))
    }
    let now = daySinceEpoch(new Date().getTime())
    for (let event of item.events) {
      if (!event) continue
      if (daySinceEpoch(event.stampMs) === now) {
        addedToday += event.value
      }
      addedTotal += event.value
    }
    let me = item.UUID === stored.get('uuid')
    let backgroundColor = randomColor({
      luminosity: me ? 'light' : 'dark',
      hue: 'blue',
      seed: item.UUID
    })

    return (
      <View
        key={item.UUID}
        style={{
          height: 40,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 20,
          backgroundColor: backgroundColor
        }}
      >
        <Text>{item.name || item.UUID}</Text>
        <Text>{addedToday}/{addedTotal}</Text>
      </View>
    )
  }

  renderGroup () {
    let items = this.state.group.map(e => {
      return this.renderGroupItem(e)
    })
    return (
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={this.state.refreshing}
            onRefresh={this.getGroupState}
          />
        }
      >
        {items}
      </ScrollView>
    )
  }

  renderGroupQRCode () {
    return (
      <View style={{ flex: 1, paddingTop: 40 }}>
        <Text style={{ padding: 10 }}>
          Anyone who scans this qr code will join your current group.
        </Text>
        <Text style={{ padding: 10 }}>
          Scan anybody's code to join their group.
        </Text>

        <Text
          style={{ padding: 10, fontSize: 20 }}
          onPress={() => this.setState({ showQr: false })}
        >
          [ Go Back ]
        </Text>

        <TouchableOpacity onPress={() => this.setState({ showQr: false })} />
        <Camera
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            alignItems: 'center'
          }}
          onBarCodeRead={data => {
            return this.query('changeGroup', data.data)
              .then(this.getGroupState)
              .then(() => {
                this.setState({ showCamera: false })
              })
          }}
          aspect={Camera.constants.Aspect.fill}
        />
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <QRCode
            value={stored.get('groupUUID')}
            size={200}
            bgColor="purple"
            fgColor="white"
          />
        </View>
      </View>
    )
  }

  render () {
    if (this.state.error) {
      return this.renderError()
    }

    if ((!this.state.loaded || this.state.spinner) && !this.state.refreshing) {
      return this.renderSpinner()
    }

    if (this.state.showQr) {
      return this.renderGroupQRCode()
    }

    return (
      <View style={styles.container}>
        {this.renderMyName()}
        {this.renderAddSelector()}
        {this.renderGroup()}
      </View>
    )
  }
}

var styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 40
  }
})
