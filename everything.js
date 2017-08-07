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
  Platform,
  View
} from 'react-native'
import QRCode from 'react-native-qrcode'
import Camera from 'react-native-camera'
var randomColor = require('randomcolor') // import the script
var PushNotification = require('react-native-push-notification')

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

class Everything extends Component {
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
        if (attempts++ >= 100) {
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
            PushNotification.configure({
              onRegister: token => {
                this.query(
                  'setDeviceId' + (Platform.OS === 'ios' ? 'iOS' : 'Android'),
                  token.token
                )
              },
              senderID: '71396173821',
              onNotification: function (notification) {},
              permissions: {
                alert: true,
                badge: false,
                sound: false
              },

              popInitialNotification: true,
              requestPermissions: true
            })

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
        <TextInput
          style={{
            height: 40,
            borderColor: 'gray',
            borderWidth: 1,
            padding: 10
          }}
          underlineColorAndroid='transparent'
          autoFocus
          placeholder='please enter your name'
          onChangeText={text => this.setState({ edittedName: text })}
          onSubmitEditing={() => {
            return stored
              .set('name', this.state.edittedName)
              .save()
              .then(() => {
                return this.query('changeName', this.state.edittedName)
              })
              .then(this.getGroupState)
              .then(res => {
                this.setState({ editName: null })
              })
          }}
          returnKeyType='send'
          value={this.state.edittedName}
        />
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
            help?
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

  renderFatalError () {
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
          <Text>
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
        <Text>{'        '}</Text>
        <TouchableOpacity
          onPress={() => {
            if (this.state.currentValue != 0) {
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
            ≫
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (this.state.currentValue != 0) {
              this.query(
                'addEvent',
                this.state.currentValue + '_1'
              ).then(() => {
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
            ≪
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  renderGroupItem (item) {
    let addedToday = {}
    let addedTotal = {}
    let daySinceEpoch = function (d) {
      return Math.floor(d / 1000 / (3600 * 24))
    }
    let now = daySinceEpoch(new Date().getTime())
    for (let event of item.events) {
      if (!event) continue
      let type = event.type || 0
      if (daySinceEpoch(event.stampMs) === now) {
        addedToday[type] = (addedToday[type] || 0) + event.value
      }
      addedTotal[type] = (addedTotal[type] || 0) + event.value
    }
    let me = item.UUID === stored.get('uuid')
    let backgroundColor = randomColor({
      luminosity: me ? 'light' : 'dark',
      hue: 'blue',
      seed: item.UUID
    })

    let textColor = me ? 'black' : 'white'
    let texts = []
    for (let item of Object.keys(addedTotal).sort()) {
      texts.push(
        <Text
          key={item}
          style={{ color: textColor, fontSize: 16, paddingRight: 5 }}
        >
          {addedToday[item]}/{addedTotal[item]}@{item}
        </Text>
      )
    }
    return (
      <View
        key={item.UUID}
        style={{
          height: 40,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: backgroundColor
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: textColor,
            fontSize: 18,
            paddingLeft: 10,
            width: 80,
            flexWrap: 'wrap'
          }}
        >
          {item.name || 'UNKNOWN'}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            padding: 10
          }}
        >
          {texts}
        </View>
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
      <View style={{ flex: 1, paddingTop: 40, padding: 20 }}>
        <Text>
          Anyone who scans this qr code will join your current group.
        </Text>
        <Text style={{ paddingTop: 10 }}>
          Scan anybody's code to join their group.
        </Text>
        <View
          style={{
            paddingTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text
            style={{ fontSize: 20 }}
            onPress={() => this.setState({ showQr: false })}
          >
            [ Go Back ]
          </Text>
          <Text
            style={{ fontSize: 20 }}
            onPress={() => {
              return this.query('changeGroup', 'no-uuid')
                .then(this.getGroupState)
                .then(() => {
                  this.setState({ showQr: false })
                })
            }}
          >
            [ Leave Group ]
          </Text>

        </View>

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
                this.setState({ showQr: false })
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
            bgColor='purple'
            fgColor='white'
          />
        </View>
      </View>
    )
  }

  render () {
    if (this.state.error) {
      return this.renderFatalError()
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

import codePush from 'react-native-code-push'
Everything = codePush(Everything)
export default Everything
