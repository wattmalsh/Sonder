'use strict';
/* eslint no-console: 0 */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import Mapbox, { MapView } from 'react-native-mapbox-gl';
import {
  StyleSheet,
  Text,
  StatusBar,
  View,
  ScrollView,
  Image,
  Linking,
  AppRegistry,
  TouchableHighlight,
  TouchableOpacity,
  Animated,
} from 'react-native';
import PopupDialog, {
  DialogTitle,
  DialogButton,
  SlideAnimation
} from 'react-native-popup-dialog';

import Styles from './Styles/MapViewStyle'
import menuStyles from './Styles/MenuStyle'
import Compass from '../Lib/Compass'
import {
  reverseTuples,
  calculateRegionCenter,
  getPrettyBearing,
  toTuples
} from '../Lib/MapHelpers';
import { makeUrl } from '../Lib/Utilities'
import FriendsHelpers from '../Lib/FriendsHelpers'
import Login from './FBLoginView'

const accessToken = 'pk.eyJ1Ijoic2FsbW9uYXgiLCJhIjoiY2l4czY4dWVrMGFpeTJxbm5vZnNybnRrNyJ9.MUj42m1fjS1vXHFhA_OK_w';
Mapbox.setAccessToken(accessToken);

import _ from 'lodash'
import qs from 'querystring'
import OAuthSimple from 'oauthsimple'
import nonce from 'nonce'
const n = nonce();
import { yelpConsumerSecret, yelpTokenSecret } from '../../config'

let menuIsHidden = true;

class SonderView extends Component {
  state = {
    initialZoomLevel: 12,
    userTrackingMode: Mapbox.userTrackingMode.follow,
    facingHood: {},
    annotations: [],
    bounceValue: new Animated.Value(100),  //This is the initial position of the subview
    // buttonText: "Show Subview",
    /*
    /*<--- Popup state --->*/
      popupView: 'current', // alternatively, 'facing'
      popupTitle: '',
      popupLat: 0,
      popupLon: 0,
      popupExtract: '',
      popupImageUrl: '',
      popupImageWidth: 0,
      popupImageHeight: 0,
      yelpData: '',
    /*<--- Popup state --->*/
      center: {
        longitude: -122.40258693695068,
        latitude: 37.78477457373192
      },
  };

  /*<------------------------------ Menu Helpers ---------------------------->*/

  _toggleSubview() {
    // this.setState({
    //   buttonText: !menuIsHidden ? "Show Subview" : "Hide Subview"
    // });

    let toValue = 100;

    if(menuIsHidden) {
      toValue = 20;
    }

    //This will animate the transalteY of the subview between 0 & 100 depending on its current state
    //100 comes from the style below, which is the height of the subview.
    Animated.spring(
      this.state.bounceValue,
      {
        toValue: toValue,
        velocity: 4,
        tension: 3,
        friction: 5,
      }
    ).start();

    menuIsHidden = !menuIsHidden;
  }

  /*<----------------------------- Popup methods ---------------------------->*/
  openDialog = (() => {
    this.popupDialog.openDialog();
  }).bind(this)

  closeDialog = (() => {
    this.popupDialog.closeDialog();
  }).bind(this)

  fetchWikiHoodInfo = (() => {
    const baseUrl = 'https://en.wikipedia.org/w/api.php?'
    const params = {
      format: 'json',
      action: 'query',
      prop: 'pageprops|info|extracts',
      exintro: '',
      explaintext: '',
      inprop: 'url',
      titles: `${ this.state.popupTitle }, San Francisco`
    }
    const url = makeUrl(baseUrl, params);

    return fetch(url)
      .then((response) => response.json())
      .then((responseJson) => {
        if (responseJson.query.pages === -1) {
          throw "Neighborhood not found in Wikipedia";
        }
        for ( var key in responseJson.query.pages) {
          let page = responseJson.query.pages[key]
          this.setState({
            popupExtract: page.extract.replace(/\n/g,"\n\n"),
            wikiUrl: page.fullurl
          });
          return page.pageprops.page_image_free
        }
      })
      .catch((error) => {
        console.log(error);
      });
  }).bind(this)

  fetchWikiHoodImageUrl = ((imageName) => {
    const baseUrl = 'https://en.wikipedia.org/w/api.php?'
    const params = {
      action: "query",
      format: "json",
      titles: `File:${imageName}`,
      prop: "imageinfo",
      iiprop: "url|size",
      iiurlwidth: "200",
    }
    const url = makeUrl(baseUrl, params);
    fetch(url)
      .then((response) => response.json())
      .then((responseJson) => {
        for ( var key in responseJson.query.pages["-1"].imageinfo) {
          let image = responseJson.query.pages["-1"].imageinfo[key]
          this.setState({
            popupImageUrl: image.thumburl,
            popupImageWidth: image.thumbwidth,
            popupImageHeight: image.thumbheight
          });
          // this.setImageUrl(image.thumburl)
          // this.setImageWidth(image.thumbwidth)
          // this.setImageHeight(image.thumbheight)
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }).bind(this)

  // TODO
  fetchYelpHoodRestaurants = (() => {
    const lat = this.state.popupLat
    const lng = this.state.popupLon
    const latlng = "ll=" + String(lat) + "," + String(lng)

    const oauth = new OAuthSimple('eUUiBEeoxTfKX2YGudP_6g', yelpTokenSecret)

    const request = oauth.sign({
      action: "GET",
      path: "https://api.yelp.com/v2/search",
      parameters: "term=coffee&" + latlng,
      signatures: {
        api_key: 'eUUiBEeoxTfKX2YGudP_6g',
        shared_secret: yelpConsumerSecret,
        access_token: 'Xc_rCgwJ7OqRAP5HiXQMIIXUw-v1QtW0',
        access_secret: yelpTokenSecret,
      },
    })

    return fetch(request.signed_url)
      .then((response) => response.json())
      .then((responseJson) => {
        console.tron.log(JSON.stringify(responseJson));
        this.setState({ yelpData: responseJson });
      })
      .catch((error) => {
        console.log(error);
      });
  }).bind(this)

  setPopupHoodData = (() => {
    const popupTitle = this.state.popupView === 'current' ?
      this.state.entities.hoods.current.name :
      this.state.facingHood.name
    let popupCoord;
    if (this.state.popupView === 'current') {
      popupCoord = this.state.annotations
        .filter(annotation => annotation.id === 'currentHoodCenter')[0]
        .coordinates
    } else {
      popupCoord = this.state.annotations
        .filter(annotation => annotation.id === 'adjacentHoodCenter')[0]
        .coordinates
    }

    this.setState({
      popupTitle: popupTitle,
      popupLat: popupCoord[0],
      popupLon: popupCoord[1],
    })

  }).bind(this)

  getpopupHoodData = (() => {
    this.setPopupHoodData();
    this.fetchWikiHoodInfo()
      .then((imageName) => {
        this.fetchWikiHoodImageUrl(imageName)
      })
      .catch((error) => {
        console.error(error);
      });
    this.fetchYelpHoodRestaurants();
  }).bind(this)

  clearpopupHoodData = (() => {
    this.setState({
      popupTitle: '',
      popupLat: 0,
      popupLon: 0,
      popupExtract: '',
      popupImageUrl: '',
      popupImageWidth: 0,
      popupImageHeight: 0,
      wikiUrl: '',
    })
  }).bind(this)
  /*<--------------------------- / Popup methods ---------------------------->*/

  /*<----------------------------- Map methods ------------------------------>*/
  onRegionDidChange = (location) => {
    this.setState({ currentZoom: location.zoomLevel });
    console.log('onRegionDidChange', location);
  };
  onOpenAnnotation = (annotation) => {
    console.log('onOpenAnnotation', annotation);

    if (annotation.id !== 'currentHoodCenter' && annotation.id !== 'adjacentHoodCenter') {
      return;
    }
    const popupView = annotation.id === 'currentHoodCenter' ?
      'current' : 'facing';
    this.setState({popupView: popupView})
    this.openDialog();

  };
  onChangeUserTrackingMode = (userTrackingMode) => {
    this.setState({ userTrackingMode });
    console.log('onChangeUserTrackingMode', userTrackingMode);
  };

  setCompassAnnotation(headingData) {
    let compassTuple = toTuples(headingData.compassLine);
    compassTuple = [compassTuple[0].reverse(), compassTuple[1].reverse()]

    const compassLineObj = {
      id: 'compassLine',
      coordinates: compassTuple,
      type: 'polyline',
      strokeColor: '#00FB00',
      strokeWidth: 4,
      strokeAlpha: .5
    }

    const compassAnnotationExists = this.state.annotations
      .filter(annotation => annotation.id === 'compassLine')
      .length === 1;

    if (compassAnnotationExists) {
      this.setState({
        annotations: this.state.annotations.map(annotation => {
          if (annotation.id === 'compassLine') {
            return compassLineObj
          } else {
            return annotation
          }
        })
      })
    } else {
      const annotations = this.state.annotations.slice();
      annotations.push(compassLineObj)
      this.setState({
        annotations: annotations
      })
    }
  }

  setCurrentHoodAnnotation() {
    if (!this.state.entities) {
      return
    }

    let annotations = this.state.annotations.slice();
    let coordinates = this.state.entities.hoods.current.coordinates[0]
    let center = calculateRegionCenter(coordinates);

    const currentHoodObj = {
      coordinates: reverseTuples(coordinates),
      type: 'polygon',
      fillAlpha: 0.3,
      strokeColor: '#ffffff',
      fillColor: '#0000ff',
      id: 'currentHood',
    }

    const currentHoodCenterObj = {
      coordinates: reverseTuples(center),
      type: 'point',
      id: 'currentHoodCenter',
    }

    const currentHoodAnnotationExists = this.state.annotations
      .filter(annotation => annotation.id === 'currentHood')
      .length === 1;

    if (currentHoodAnnotationExists) {
      this.setState({
        annotations: this.state.annotations.map(annotation => {
          if (annotation.id === 'currentHood') {
            return currentHoodObj
          } else if (annotation.id === 'currentHoodCenter') {
            return currentHoodCenterObj
          } else {
            return annotation
          }
        })
      })
    } else {
      const annotations = this.state.annotations.slice();
      annotations.push(currentHoodObj)
      annotations.push(currentHoodCenterObj)
      this.setState({
        annotations: annotations
      })
    }
  }

  setAdjacentHoodAnnotation() {
    this.setFacingHood();

    if (!this.state.entities) {
      return
    }

    let annotations = this.state.annotations.slice();
    let coordinates = this.state.facingHood.coordinates[0]
    let center = calculateRegionCenter(coordinates);

    const adjacentHoodObj = {
      coordinates: reverseTuples(coordinates),
      type: 'polygon',
      fillAlpha: 0.3,
      strokeColor: '#00e6e6',
      fillColor: '#00e6e6',
      id: 'adjacentHood',
    }

    const adjacentHoodCenterObj = {
      coordinates: reverseTuples(center),
      type: 'point',
      id: 'adjacentHoodCenter',
    }

    const adjacentHoodAnnotationExists = this.state.annotations
      .filter(annotation => annotation.id === 'adjacentHood')
      .length === 1;

    if (adjacentHoodAnnotationExists) {
      this.setState({
        annotations: this.state.annotations.map(annotation => {
          if (annotation.id === 'adjacentHood') {
            return adjacentHoodObj
          } else if (annotation.id === 'adjacentHoodCenter') {
            return adjacentHoodCenterObj
          } else {
            return annotation
          }
        })
      })
    } else {
      const annotations = this.state.annotations.slice();
      annotations.push(adjacentHoodObj)
      annotations.push(adjacentHoodCenterObj)
      this.setState({
        annotations: annotations
      })
    }
  }
  /*<---------------------------- / Map methods ----------------------------->*/

  /*<---------------- Component mounting/unmounting methods ----------------->*/
  componentWillMount() {
    Compass.start({
      minAngle: 1,
      radius: 10,
      onInitialPosition: (initialPosition) => {
        this.setState({ initialPosition })
      },
      onInitialHoods: ({ currentHood, adjacentHoods, hoodLatLngs, streetLatLngs}) => {
        this.setState({
          currentHood,
          adjacentHoods,
          hoods: hoodLatLngs,
          streets: streetLatLngs,
        });
      },
      onHeadingSupported: (headingIsSupported) =>
        this.setState({ headingIsSupported }),
      onPositionChange: (lastPosition) =>
        this.setState({ lastPosition }),
      onHeadingChange: (headingData) => {
        this.setCompassAnnotation(headingData)
        this.setAdjacentHoodAnnotation()
      },
      onEntitiesDetected: (entities) => {
        this.setState({ entities });
        this.setCurrentHoodAnnotation();
        this.setAdjacentHoodAnnotation();
      }
    });
  }

  componentWillUnmount() {
    Compass.stop();
  }
  /*<--------------- / Component mounting/unmounting methods ---------------->*/

  setFacingHood() {
    if (!this.state.entities) {
      return
    }
    this.setState({facingHood: this.state.entities.hoods.adjacents
      .reduce((closestHood, hood) => hood.distance < closestHood.distance ?
        hood : closestHood
      )
    })
  }
  /*<---------------------------- / Map methods ----------------------------->*/

  /*<---------------- Component mounting/unmounting methods ----------------->*/
    componentWillMount() {
      Compass.start({
        minAngle: 1,
        radius: 10,
        onInitialPosition: (initialPosition) => {
          this.setState({ initialPosition })
        },
        onInitialHoods: ({ currentHood, adjacentHoods, hoodLatLngs, streetLatLngs}) => {
          this.setState({
            currentHood,
            adjacentHoods,
            hoods: hoodLatLngs,
            streets: streetLatLngs,
          });
        },
        onHeadingSupported: (headingIsSupported) =>
          this.setState({ headingIsSupported }),
        onPositionChange: (lastPosition) =>
          this.setState({ lastPosition }),
        onHeadingChange: (headingData) => {
          this.setCompassAnnotation(headingData)
          this.setAdjacentHoodAnnotation()
        },
        onEntitiesDetected: (entities) => {
          this.setState({ entities });
          this.setCurrentHoodAnnotation();
          this.setAdjacentHoodAnnotation();
        }
      });

      console.log('INSIDE componentWillMount. PROPS: ', this.props)
      // set annotations for intial friendsLocations
      // this.setState((prevState, props) => {
      //   return FriendsHelpers.updateFriendsLocations(prevState, props)
      // }) //PAIGE PAIGE PAIGE PAIGE
    }

    componentWillUnmount() {
      Compass.stop();
    }

    componentWillReceiveProps(nextProps) {
      // annotations change dynamically based on changes in friendsLocations
      this.setState((prevState, nextprops) => {
        return FriendsHelpers.updateFriendsLocations(prevState, nextProps)
      })
    }
  /*<--------------- / Component mounting/unmounting methods ---------------->*/

  render() {
    StatusBar.setHidden(true);
    return (
      /*------------------------------ Map View ----------------------------- */
      <View style={styles.container}>
        <MapView
          ref={map => { this._map = map; }}
          style={styles.map}
          initialCenterCoordinate={this.state.center}
          initialZoomLevel={this.state.initialZoomLevel}
          initialDirection={0}
          rotateEnabled={true}
          scrollEnabled={true}
          zoomEnabled={true}
          showsUserLocation={false}
          styleURL={Mapbox.mapStyles.streets}
          userTrackingMode={this.state.userTrackingMode}
          annotations={this.state.annotations}
          annotationsAreImmutable
          annotationsPopUpEnabled={true}
          onChangeUserTrackingMode={this.onChangeUserTrackingMode}
          onRegionDidChange={this.onRegionDidChange}
          onRegionWillChange={this.onRegionWillChange}
          onOpenAnnotation={this.onOpenAnnotation}
          onRightAnnotationTapped={this.onRightAnnotationTapped}
          onUpdateUserLocation={this.onUpdateUserLocation}
          onLongPress={this.onLongPress}
          onTap={this.onTap}
          logoIsHidden
        />
      {/*----------------------------- / Map View ---------------------------*/}


      {/*---------------------------- Popup View --------------------------- */}
        <PopupDialog
          // ref={(popupDialog) => { this.setState({popupDialog: popupDialog}); }}
          ref={(popupDialog) => { this.popupDialog = popupDialog }}
          onOpened={() => {this.getpopupHoodData(); }}
          onClosed={() => {this.clearpopupHoodData(); }}
          width={.85}
          height={.75}
          dialogStyle={{padding: 10}}
          actions={[
            <DialogButton
              buttonStyle={{height: 20, justifyContent: 'center', marginTop: 10}}
              textContainerStyle={{paddingVertical: 0, paddingHorizontal: 0}}
              textStyle={{fontSize: 12, color: 'grey', fontWeight: '300'}}
              text="CLOSE"
              align="center"
              onPress={this.closeDialog}
              key="closePopup"
            />
          ]}
          dialogTitle={
            <DialogTitle
              titleTextStyle={{fontSize: 20}}
              title={this.state.popupTitle}
            />
          }
        >

          <ScrollView>
            <View  style={{alignItems: 'center', marginHorizontal: 20}}>
              <Image
                style={{marginVertical: 5, resizeMode: 'contain'}}
                source={{uri: this.state.popupImageUrl}}
                width={this.state.popupImageWidth}
                height={this.state.popupImageHeight}
                maintainAspectRatio={true}
              />
              <Text
                style={{
                  fontSize: 16,
                  textAlign: 'justify'
                }}
              >
              {this.state.popupExtract}
              </Text>
              <Text onPress={() => {
                Linking.openURL(this.state.wikiUrl)
                  .catch(err => console.error('An error occurred', err));}}
                  style={{
                    fontSize: 12,
                    textAlign: 'left',
                    padding: 10,
                    color: 'blue'
                  }}
                >{this.state.wikiUrl ? "Wikipedia" : ""}
              </Text>
            </View>
          </ScrollView>

        </PopupDialog>
      {/*--------------------------- / Popup View -------------------------- */}

      {/*--------------------------- Menu Subview -------------------------- */}
        <TouchableOpacity onPress={()=> {this._toggleSubview()}}>
          <Image source={require('../Images/mapreactor.png')} style={menuStyles.sonderButton}></Image>
        </TouchableOpacity>

        <View style={menuStyles.container}>
          <Animated.View
            style={[
              menuStyles.subview,
              {transform: [{translateY: this.state.bounceValue}]}
            ]}
          >
            {/* <TouchableHighlight underlayColor="rgba(225, 225, 225, 0.3)" onPress={()=> {this._toggleSubview()}}>
              <Text style={menuStyles.textButton}>Logout</Text>
            </TouchableHighlight> */}
            <Login style={menuStyles.facebookButton} />
            <TouchableHighlight underlayColor="rgba(225, 225, 225, 0.3)" onPress={()=> {this._toggleSubview()}}>
              <Text style={menuStyles.textButton}>Cancel</Text>
            </TouchableHighlight>

          </Animated.View>
        </View>
      {/*-------------------------- / Menu Subview ------------------------- */}

      {/*---------------------------- Debugger View ------------------------ */}

        <View style={{ maxHeight: 200 }}>
          <ScrollView>

            <Text onPress={() => {
              Linking.canOpenURL('yelp:///biz/the-sentinel-san-francisco')
                .then(supported => {
                  if (!supported) {
                    Linking.openURL('https://www.yelp.com/biz/the-sentinel-san-francisco')
                  } else {
                    return Linking.openURL('yelp:///biz/the-sentinel-san-francisco');
                  }
                })
                .catch(err => console.error('An error occurred', err))}}>
              Click me to open yelp!
            </Text>

            <Text onPress={() => {this._map.selectAnnotation('??friend', animated = true);}}>
              "Click me to toggle annotation"
            </Text>

            <Text onPress={() => {this.fetchYelpHoodRestaurants()}}>
              {'Fetch Yelp Data:'}
            </Text>

            <Text>{this.state.yelpData ?
              '*** this.state.yelpData: ' + JSON.stringify(this.state.yelpData) :
              "Waiting for yelp Data..."}
            </Text>

            <Text>{this.state.entities ?
              '*** this.state.entities.hoods: ' + JSON.stringify(this.state.entities.hoods) :
              "Waiting for entities..."}
            </Text>

            <Text>{this.state.headingIsSupported ?
              '*** this.state.heading: ' + getPrettyBearing(this.state.heading) :
              "Heading unsupported." }
            </Text>

            <Text>{this.state.entities ?
              '*** this.state.entities.streets: ' + JSON.stringify(this.state.entities.streets) :
              "Normalizing reticulating splines..."}
            </Text>

            <Text>{this.state.annotations ?
              '*** this.state.annotations: ' + JSON.stringify( this.state.annotations ) :
              null}
            </Text>

          </ScrollView>
        </View>

      {/*--------------------------- / Debugger View ----------------------- */}
      </View>
    );
  }

}

const mapStateToProps = (state) => {
  return {
    friendsLocations: state.friendsLocations
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch'
  },
  map: {
    flex: 1
  },
  scrollView: {
    flex: 1
  }
});

export default connect(mapStateToProps)(SonderView)
