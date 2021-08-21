'use strict';

//config must be impelemented here
const platform = configPlatform();
const defaultLayers = configLayers();
let searchMarker;
let markerMode = false;
let rangeMode = false;

let group = new H.map.Group();
let rangeGroupCircle = new H.map.Group();//unused now
let rangeGroupPoints = new H.map.Group();
let polyLinesGroup = new H.map.Group();


let lastBubbleMarker = {
    id: null,
    title: null,
    description: null
};


/* Arrays with data */
let markers = [];
let rangeMarkers = [];

let rangeLineString = [];
let rangePolylines = [];





var waypoints = [];
var routePolylines = [];
var distanceTotal = null;

// map instantiate must be global too
var map = new H.Map(
    document.getElementById('js-map-container'),
    defaultLayers.vector.normal.map,
    {
      zoom: 10,
    }
);

const ui = H.ui.UI.createDefault(map, defaultLayers);
const mapEvents = new H.mapevents.MapEvents(map);
const behavior = new H.mapevents.Behavior(mapEvents);
let icon = setCustomMarker();

//const lineString = new H.geo.LineString();
var routingService = platform.getRoutingService();
const searchService = platform.getSearchService();

initMapView();

/** FUNCTIONS */

/**
 * Get init position if geolocation is not supported
 * @return {object}
 */
function getInitPosition() {
    return {lng: 18.562839672106392, lat: 50.215545083510094};
}

/**
 * Set map view to user current position
 */
function initMapView() {
    if (navigator.geolocation) {
        getActualPosition().then((currentPos) => {
            const currentCoords = currentPos.coords;
            setMapView(currentCoords);
        }).catch(() => {
            const currentCoords = getInitPosition();
            setMapView(currentCoords);
        });
    } else {
        const currentCoords = getInitPosition();
        setMapView(currentCoords);
        alert('Geolokalizacja nie jest wspierana.');
    }
}

/**
 * Set view of map
 * @param {Array} currentCoords Array with position coords to show on the map
 */
function setMapView(currentCoords) {
    if (currentCoords.latitude) {
        map.setCenter({lat: currentCoords.latitude, lng: currentCoords.longitude});
        return;
    } 
    
    map.setCenter({lat: currentCoords.lat, lng: currentCoords.lng});
}

/**
 * Get actual position of user
 */
function getActualPosition() {
    return new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej);
    });
}

/**
 * Shows curent location by marker on the map
 */
function showCurrentLocation() {
    getActualPosition().then((currentPos) => {
        const currentCoords = {
            lat: currentPos.coords.latitude,
            lng: currentPos.coords.longitude
        };
        showSearchMarker(currentCoords);
    });
}

/**
 * Show marker of search position on the map
 * @param {Array} coords
 */
function showSearchMarker(coords) {
    if (searchMarker) {
        map.removeObject(searchMarker);
    }
    setMapView(coords);
    searchMarker = new H.map.Marker(coords);
    map.addObject(searchMarker);
}

/**
 * Disable button
 * @param {jQueryObject} $button JQuery handler to the button
 */
function disableButton($button) {   
    $button.prop('disabled', true);
    $button.append('<i class="fas fa-spinner fa-spin"></i>');
}

/**
 * Enable button
 * @param {jQueryObject} $button JQuery handler to the button
 */
function enableButton($button) {
    $button.prop('disabled', false);
    $button.children('.fa-spinner').remove();
}

/**
 * Shows any informations to information panel
 * @param {string} messageTitle String with message title
 * @param {string} message String with message to show 
 * @param {string} messageType String with type of message to show [default = 'error']
 */
function showMapResponse(messageTitle, message, messageType = 'error') { 
    Swal.fire({
        icon: messageType,
        title: messageTitle,
        text: message
    });

}

/**
 * Get location from search input and search position of it
 */
function getLocationFromSearch() {
    const $searchButton = $('#js-search-button');
    disableButton($searchButton);

    const locationSearch = $('#js-geolocation').val();
    if (locationSearch) {
        searchService.geocode({
            q: locationSearch
        }, (result) => {
            result.items.forEach((item) => {
                console.log(item.position);
                showSearchMarker(item.position);
                enableButton($searchButton);
            });
        }, (error) => {
            showMapResponse('Błąd', 'Nie można znaleźć podanego miejsca.');
            enableButton($searchButton);
        });
    } else {
        showMapResponse('Infomacja', 'Podaj proszę miejsce, które chcesz wyszukać.', 'info');
        enableButton($searchButton);
    }   
}

/**
 * Show/hide search marker
 */
function toggleSearchMarker() {
    if (searchMarker) {
        if (searchMarker.getVisibility()) {
            searchMarker.setVisibility(false);
        } else {
            searchMarker.setVisibility(true);
        }
    }
}

/**
 * Toggle marker mode
 * @param {jQueryObject} $markerModeBtn
 */
function toggleMarkerMode($markerModeBtn) {
    if (markerMode) {
        markerMode = false;
        $markerModeBtn.removeClass('.active');
        $('#js-info-panel').text('Tryb zaznaczania jest wyłączony');
        return;
    }

    markerMode = true;
    $markerModeBtn.addClass('.active');
    $('#js-info-panel').text('Tryb zaznaczania został włączony');
}

/**
 * Add click event listener to map
 */
function addClickEventListener() {
    map.addEventListener('tap', async (evt) => {
        if (!markerMode) {
            return;
        }

        const coord = map.screenToGeo(
            evt.currentPointer.viewportX,
            evt.currentPointer.viewportY
        );

        if (rangeMode) {
            if (rangeMarkers.length > 1) {
                $('#js-stop-add-range').prop('disabled', false);
            }
            addPointsToRange(coord);
            return;
        }

        const { value: formValues } = await Swal.fire({
            title: 'Dane miejsca',
            html: `
                <label for="swal-bubble-title" class="swal2-input-label">Tytuł:</label>
                <input class="swal2-input custom-size d-flex" id="swal-bubble-title" placeholder="Tytuł np. nazwa firmy" type="text">
                <label for="swal-bubble-description" class="swal2-input-label">Opis:</label>
                <textarea aria-label="Umieść tutaj opis..." class="swal2-textarea custom-size d-flex" placeholder="Umieść tutaj opis..." id="swal-bubble-description"></textarea>
                <div class="d-inline-flex align-items-center mt-2">
                    <input id="swal-bubble-range" type="checkbox" checked="true">
                    <span class="ms-2 swal2-label">Chcę dodać obszar</span>
                </div>
                `,
            showClass: {
                popup: 'animate__animated animate__fadeInDown'
            },
            hideClass: {
                popup: 'animate__animated animate__fadeOutUp'
            },
            focusConfirm: false,
            preConfirm: () => {
                return [
                    $('#swal-bubble-title').val(),
                    $('#swal-bubble-description').val(),
                    $('#swal-bubble-range').prop('checked')
                ];
            }
        });

        if (formValues) {
            const [title, description, range] = formValues;
            addInfoBubble(title, description, coord);

            if (range) {
                $('#js-add-marker').prop('disabled', true);
                showMapResponse('Dodawanie zasięgu zostało wlączone', 'Klikaj w punkty, aby określić zasięg...', 'info')
                $('#js-info-panel').text('Klikaj w punkty, aby określić zasięg...');
                rangeMode = true;
            }
        }
    });
}

/**
 * Takes a snapshot of the map.
 */
function capture() {
  map.capture((canvas) => {
    if (canvas) {
        canvas.style.width = '350px';
        canvas.style.height = 'auto';
      $('.js-image-map').last().append(canvas);
      return;
    }
    
    showMapResponse('Błąd', 'Niestety nie udało się dodać zdjęcia, ponieważ przeglądarka nie wspiera takiej funkcjonalności', 'danger');
    resultContainer.innerHTML = 'Capturing is not supported';
  }, [ui]);
}


function savePlace() {
    const cardHtml = `
    <div class="col-12">
        <div class="card js-place-card" data-marker-id="${lastBubbleMarker.id}">
            <div class="card-image-top js-image-map"></div>
            <div class="card-body">
                <h5 class="card-title">${lastBubbleMarker.title}</h5>
                <p class="card-text">${lastBubbleMarker.description}</p>
                <a href="#" role="button" class="btn btn-danger js-remove-bubble-marker">Usuń znacznik</a>
                <a href="#" role="button" class="btn btn-primary js-navigate-to-bubble-marker">Pokaż na mapie</a>
            </div>
        </div>
    </div>`;
    $('#js-empty-saved-places').hide();
    $('#js-saved-places-list').append(cardHtml);


    capture();
}

/**
 * Creates a new marker and adds it to a group
 * @param {H.geo.Point} coordinate  The location of the marker
 * @param {String} bubbleTitle          Marker title
 * @param {String} bubbleDescription    Marker description
 */
function addMarkerToGroup(coordinate, bubbleTitle, bubbleDescription) {
    const html = `
            <div class="fw-bold bubble-title">${bubbleTitle}</div>
            <div class="bubble-description">${bubbleDescription}</div>

        `;
    const outerElement = `<div class="marker-ribbon">${trimString(bubbleTitle)}</div>`;
    const domIcon = new H.map.DomIcon(outerElement, {});
    let marker = new H.map.DomMarker(coordinate, {
        icon: domIcon
    });
    
    lastBubbleMarker.id = marker.getId();
    lastBubbleMarker.title = bubbleTitle;
    lastBubbleMarker.description = bubbleDescription;

    marker.setData(html);
    group.addObject(marker);
    markers.push(marker);
}

/**
 * Creates a new range point marker
 * @param {H.geo.Point} coordinate  The location of the marker
 */
function addPointsToRange(coordinate) {
    const marker = new H.map.Marker(coordinate, {
        icon: icon
    });
  
    rangeGroupPoints.addObject(marker);
    rangeMarkers.push(marker);
    map.addObject(rangeGroupPoints);
    drawRangeLine();
}

/**
 * Draw line from range points
 */
function drawRangeLine() {
    if (rangeMarkers.length < 2) {
        return;
    }

    rangeLineString = new H.geo.LineString();
    rangeMarkers.forEach(routeCoord => {
        rangeLineString.pushLatLngAlt(routeCoord.b.lat, routeCoord.b.lng, 0);
    });

    if (true) {
        const polyline = new H.map.Polyline(
            rangeLineString, 
            {
                style: 
                    {
                        strokeColor: 'rgb(0, 130, 130)',
                        lineWidth: 2
                    }
            }
        );

        polyLinesGroup.addObject(polyline);
        rangePolylines.push(polyline); 
        map.addObject(polyLinesGroup);
    }
}

/**
 * Draw range polygon
 */
function drawRangePolygon() {
    if (rangeMarkers.length < 3) {
        return;
    }

    
    map.addObject(
        new H.map.Polygon(rangeLineString, {
            style: {
                fillColor: 'rgba(0, 255, 221, 0.66)',
                strokeColor: 'rgba(0, 255, 221, 1)',
                lineWidth: 2
            }
        })
    );
    savePlace();
}

/**
 * Add two markers showing the position of Liverpool and Manchester City football clubs.
 * Clicking on a marker opens an infobubble which holds HTML content related to the marker.
 * @param {string} bubbleTitle
 * @param {string} bubbleDescription
 * @param {object} coord
 */
function addInfoBubble(bubbleTitle, bubbleDescription, coord) {
    map.addObject(group);

    // add 'tap' event listener, that opens info bubble, to the group
    group.addEventListener('tap', (evt) => {
        // event target is the marker itself, group is a parent event target
        // for all objects that it contains
        const bubble = new H.ui.InfoBubble(evt.target.getGeometry(), {
        // read custom data
        content: evt.target.getData()
    });
        // show info bubble
        ui.addBubble(bubble);
    }, false);

    addMarkerToGroup(
        {lat: coord.lat, lng: coord.lng },
        bubbleTitle,
        bubbleDescription
    );
}

/**
 * trim string 
 * @param  {string} text   
 * @param  {Number} length 
 * @return {string}
 */
function trimString(text, length = 20) {
    return text.length > length ? text.substring(0, length - 3) + '...' : text;
}


//         waypoints.push({
            //     id: marker.getId(),
            //     coord: {
            //         lat: coord.lat,
            //         lng: coord.lng
            //     }
            // });
            // 


/**
 * Get bubble marker id from card
 * @param  {jQueryObject} $clickedItem 
 * @return {number} 
 */
function getCardBubbleMarkerId($clickedItem) {
    const $placeCard = $clickedItem.closest('.js-place-card').first();
    return parseInt($placeCard.attr('data-marker-id'), 10);
}

$(document).ready(function() {
    window.addEventListener('resize', () => map.getViewPort().resize());
    $(document).on('click', '.js-navigate-to-bubble-marker', function() {
        const bubbleMarkerId = getCardBubbleMarkerId($(this));
        const bubbleMarker = group.getObjects().filter((item) => {
            return item.getId() === bubbleMarkerId;
        });

        setMapView(bubbleMarker[0].getGeometry());
    });

    $(document).on('click', '.js-remove-bubble-marker', function() {
        const bubbleMarkerId = getCardBubbleMarkerId($(this));
        const bubbleMarker = group.getObjects().filter((item) => {
            return item.getId() === bubbleMarkerId;
        });

        group.removeObject(bubbleMarker[0]);
    });


    
    addClickEventListener();




    $('#js-current-position').click(() => {
        showCurrentLocation();
    });

    $('#js-search-button').click(() => {
        getLocationFromSearch();
    });

    $('#js-toogle-marker').click(() => {
        toggleSearchMarker();
    });

    $('#js-add-marker').click(() => {
        toggleMarkerMode($(this));
    });

    $('#js-stop-add-range').click(() => {
        const $addMarkerBtn = $('#js-add-marker');
        toggleMarkerMode($addMarkerBtn);
        $addMarkerBtn.prop('disabled', false);

        $('#js-stop-add-range').prop('disabled', true);
        drawRangePolygon();

        rangeMode = false;
        rangeGroupPoints.removeAll();
        polyLinesGroup.removeAll();
        
        rangeMarkers.length = 0;
        rangeLineString.length = 0;
        rangePolylines.length = 0;

    });
    

  
    //document.getElementById("remove-last-js").addEventListener("click", removeLastWaypointMarker);
    //document.getElementById("remove-all-js").addEventListener("click", removeAllWaypointsMarkers);
    //document.getElementById("continue-js").addEventListener("click", sendData);
    //document.getElementById("remove-message-js").addEventListener("click", removeMapResponse);
});

/**
 * Set custom marker
 */
function setCustomMarker() {
    var svgMarkup = '<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg">' +
    '<circle fill="royalblue" cx="7" cy="7" r="7" /></svg>';

    return new H.map.Icon(svgMarkup);
}

/* Config functions */
function configPlatform() {
    return new H.service.Platform({
        'apikey': window.apikey,
    });
}

function configLayers() {
    return platform.createDefaultLayers();
}

















/**
 * calculateDistance Calculate distance of drawed route
 * @param  {Boolean} isRemovedMarker Do you want recalculate distance after remove marker? [optional]
 */
function calculateDistance(isRemovedMarker = false)
{
    if (isRemovedMarker && waypoints.length == 1) {
        resetDistance();
    }

    if(waypoints.length > 1) {
        calculateRouteData(isRemovedMarker).then((result) => {
            showDistance(result);
        }).catch((errorData) => {
            showMapResponse('Cannot calculate route.');
        });            
    }
}












































/**
 * calculateRouteData Prepare and do call to api
 * @param  {Boolean} isRemovedMarker Do you want recalculate distance after remove marker?
 * @param  {Boolean} needElevation   Do you want to get elevation data (altitude)? [optional]
 */
function calculateRouteData(isRemovedMarker, needElevation = false)
{
    return new Promise( (resolve, reject) => {
        var routingParameters = {
            mode: 'shortest;pedestrian',
            routeattributes : 'summary,shape',
            representation: 'display',
            returnElevation: needElevation
        };

        //Add all waypoints to route
        var index = 0;
        waypoints.forEach( (waypoint) => {
            routingParameters['waypoint' + index++] = 'geo!' + waypoint.coord.lat + ',' + waypoint.coord.lng;
        });

        var routingService = platform.getRoutingService();
        routingService.calculateRoute(routingParameters, result => {
            let response = result.response;
            if (response.route[0]) {
                var lineString = new H.geo.LineString();
                response.route[0].shape.forEach(routeCoord => {
                    var routeCoordArray = routeCoord.split(',');

                    lineString.pushLatLngAlt(routeCoordArray[0], routeCoordArray[1], 0);
                });

                if (!isRemovedMarker) {
                    var polyline = new H.map.Polyline(
                        lineString, 
                        {
                            style: 
                                {
                                    strokeColor: 'rgb(0, 130, 130)',
                                    lineWidth: 2
                                }
                        }
                    );
                    routePolylines.push(polyline); 
                    map.addObject(polyline);
                }

                resolve(response.route[0]);
            }
        }, 
            error => { 
                reject(error);
        });
    });
}

/**
 * showDistance Show total distance on map panel
 * @param  {Array} routeData Array with route data 
 */
function showDistance(routeData)
{
    var routeDistanceTotal = routeData.summary.distance;
    distanceTotal = (routeDistanceTotal/1000);

    if (routeDistanceTotal < 1000) {
        document.getElementById('distance-js').innerHTML = routeDistanceTotal+" m";
    } else {
        document.getElementById('distance-js').innerHTML = distanceTotal+" km";
    }
}

/**
 * resetDistance Reset distance on the map panel
 */
function resetDistance()
{
    document.getElementById('distance-js').innerHTML = "0 m";
}

/**
 * removeMapResponse Remove info panel message
 */
function removeMapResponse()
{
    var $infoPanel = $("#info-panel");
    var $infoMessage = $("#info-message-js");
    $infoPanel.fadeOut(500, () => {
        $infoMessage.html('');
    });
}


/**
 * removeLastWaypointMarker Remove last route marker
 */
function removeLastWaypointMarker()
{
    if(waypoints.length > 0) {
        var lastWaypoint = waypoints.pop();
        var lastMarker = markers.pop();
        map.removeObject(lastMarker);
        var lastPolyline = routePolylines.pop();
        if (lastPolyline) {
            map.removeObject(lastPolyline);
        }
        calculateDistance(true);
    } else {
        showMapResponse('No more markers to delete.');
    }
}

/**
 * removeAllWaypointsMarkers Reset route
 */
function removeAllWaypointsMarkers()
{
    if(waypoints.length > 0) {
        waypoints.length = 0;
        markers.length = 0;
        routePolylines.length = 0;
        map.removeObjects(map.getObjects());
        resetDistance();
    } else {
        showMapResponse('No more markers to delete.');
    }
}

/**
 * sendData Send workout data to server to process it
 * @param event 
 */
function sendData(event)
{
    disableButton($(event.target));
    event.preventDefault();
    removeFormErrors();
    if (waypoints.length > 1) {
        
        const $form = $('.js-new-workout-form');
        var formData = {};
        //Group formData because I don't want allow_extra_fields in form
        formData['formData'] = {}
        formData['formData']['durationSecondsTotal'] = {};

        for(let fieldData of $form.serializeArray()) {        
            if(fieldData.name == 'durationSecondsTotal[hour]'){
                formData['formData']['durationSecondsTotal']['hour'] = fieldData.value;
            } else if(fieldData.name == 'durationSecondsTotal[minute]') {
                formData['formData']['durationSecondsTotal']['minute'] = fieldData.value;
            } else if(fieldData.name == 'durationSecondsTotal[second]') {
                formData['formData']['durationSecondsTotal']['second'] = fieldData.value;
            } else {
                formData['formData'][fieldData.name] = fieldData.value;
            }
            if (!fieldData.value) {
                enableButton($(event.target));
                showMapResponse('Form data is missing.');
                return;
            }
        }

        calculateRouteData(true, true).then((result) => {
            captureImageAndSaveWorkout(formData, result);
        }).catch((errorData) => {
            showMapResponse('Cannot recalculate route. Try again.');
        });      
    } else {
        showMapResponse('Draw your route first.');   
    }
    enableButton($(event.target));
}

/**
 * captureImageAndSaveWorkout Get image of workout and send all data to database
 * @param  {Array} formData  Array with form data
 * @param  {Array} routeData Array with route data
 */
function captureImageAndSaveWorkout(formData, routeData)
{
    var url = document.getElementById('continue-js').getAttribute('data-url');
    map.capture((canvas) => {
        if (canvas) {
            var mapImage = canvas.toDataURL();
            formData['distanceTotal'] = distanceTotal;
            formData['image'] = mapImage;
            formData['routeData'] = routeData.shape;
        
            saveWorkout(formData,url).then((result) => {
                window.location.href = result.url;
            }).catch((errorData) => {
                if (errorData.type !== 'form_validation_error') {
                    showMapResponse(errorData.title);
                } else {
                    mapErrorsToForm(errorData);
                }                    
            });
        } else {
            showMapResponse('Capturing is not supported.');
        }
    }, []);
}

/**
 * saveWorkout Send workout data to server and get response
 * @param  {Array} data Array with workout data
 * @param  {String} url Url to server method
 */
function saveWorkout(data, url) {
    return new Promise( (resolve, reject) => {
        $.ajax({
            url,
            method: 'POST',
            data: JSON.stringify(data)
        }).then((result) => {
            resolve(result);
        }).catch((jqXHR) => {
            let statusError = [];
            statusError = getStatusError(jqXHR);
            if(statusError != null) {
                reject(statusError);
            } else {
                const errorData = JSON.parse(jqXHR.responseText);
                reject(errorData);
            }
        });
    });
}

/**
 * getStatusError Get status error and return proper message
 * @param jqXHR 
 * @return {Array} Array with message
 */
function getStatusError(jqXHR) {
    if (jqXHR.getResponseHeader('content-type') === 'application/problem+json') {
        return null;
    }

    if(jqXHR.status === 0) {
        return {
            "title":"Cannot connect. Verify Network."
        }
    } else if(jqXHR.status === 404) {
        return {
            "title":"Requested not found."
        }
    } else if(jqXHR.status === 500) {
        return {
            "title":"Internal Server Error"
        }
    } else if(jqXHR.status > 400) {
        return {
            "title":"Error. Contact with admin."
        }
    }
    return null;
}

/**
 * mapErrorsToForm Map errors to proper form fields
 * @param  {Array} errorData Array with form errors
 */
function mapErrorsToForm(errorData)
{
    var $form = $('.js-new-workout-form');

    for (let element of $form.find(':input')) {
        let fieldName = $(element).attr('name');
        const $fieldWrapper = $(element).closest('.form-group');

        if(fieldName == 'durationSecondsTotal[hour]') {
            fieldName = 'durationSecondsTotal';
        }

        if (!errorData[fieldName]) {
            continue;
        }

        const $error = $('<span class="js-field-error help-block text-danger"></span>');
        $error.html(errorData[fieldName]);
        $fieldWrapper.append($error);
        $fieldWrapper.addClass('has-error');
    }
}

/**
 * removeFormErrors Remove all errors from form fields
 */
function removeFormErrors() {
    var $form = $('.js-new-workout-form');
    $form.find('.js-field-error').remove();
    $form.find('.form-group').removeClass('has-error');
}