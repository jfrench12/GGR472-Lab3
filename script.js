// When the page loads, immediately try to download the neighbourhoods
// (we need this data for the map and the dropdown)
const neighbourhoodsPromise = (async function downloadNeighbourhoods() {
	try {
		const response = await fetch(
			// Use GitPages URL
			"https://jfrench12.github.io/GGR472-Lab3/NeighbourhoodsWithCentroids.geojson"
		);
		if (!response.ok) {
			throw new Error("Response was not ok loading json data");
		}
		const json = await response.json();
		// Ensure each neighbourhood has an ID so we can track which one is hovered later
		json.features.forEach((feature, index) => {
			feature.id = index;
		});
		return json;
	} catch (error) {
		console.error("Error loading neighbourhoods:", error);
		return null;
	}
})();

const CAP_PERC_COLORS = ["#deecfb", "#bedaf7", "#7ab3ef", "#368ce7"];

/*--------------------------------------------------------------------
INITIALISE MAP
--------------------------------------------------------------------*/
mapboxgl.accessToken = "pk.eyJ1IjoiamZyZW5jaDUiLCJhIjoiY201eGVlNG42MDg5bjJub25nZjF3b3Y5eiJ9.i1clyXkpZVVJQ_iy-Jt7DQ"; // Mapbox public map token

// Default map location data so we can reuse it on the reset button
const defCenter = [-79.35, 43.7]; // Downtown Toronto [long, lat]
const defZoom = 11; // Zoom where you can see all the bike stations

const map = new mapboxgl.Map({
	container: "map",
	style: "mapbox://styles/jfrench5/cm6vcs0z1002m01s3cfz02880", // Custom style using satellite image
	center: defCenter,
	zoom: defZoom,
});

/*--------------------------------------------------------------------
MAP CONTROLS
--------------------------------------------------------------------*/
map.addControl(new mapboxgl.NavigationControl());
map.addControl(new mapboxgl.FullscreenControl());

const geocoder = new MapboxGeocoder({
	accessToken: mapboxgl.accessToken,
	mapboxgl: mapboxgl,
	countries: "ca",
	bbox: [-79.6393, 43.6511, -79.1166, 43.8554], // Only allow searching within Toronto
	proximity: [-79.3832, 43.6532], // Prioritize entries based on proximity to downtown
});

document.getElementById("geocoder").appendChild(geocoder.onAdd(map));

/*--------------------------------------------------------------------
ACCESS AND VISUALIZE DATA
--------------------------------------------------------------------*/

// Add data source and draw initial visiualization of layer
// Here we will load the json data to use for the dropdown items
map.on("load", async () => {
	// Wait to finish downloading the neighboorhood geojson
	const neighbourhoodJson = await neighbourhoodsPromise;

	loadNeighbourhoodDropdown(neighbourhoodJson);
	// Only try to show neighbourhoods if they loaded ok, otherwise don't add layers so at least you can see
	// the rest of the map
	if (neighbourhoodJson) {
		loadNeighbourhoodLayers(neighbourhoodJson);
	}
});

// Loads the dropdown for selecting neighbourhood
function loadNeighbourhoodDropdown(neighbourhoodJson) {
	if (!neighbourhoodJson || !neighbourhoodJson.features || !neighbourhoodJson.features.length) {
		// On error loading hide the dropdown since it will have no options
		document.getElementById("neighbourhooddropdown").style.display = "none";
		return;
	}
	const select = document.getElementById("boundaryselect");
	if (!select) {
		return;
	}
	const neighbourhoodNames = neighbourhoodJson.features
		// Filter out any neighbourhoods without names
		.filter((feature) => feature && feature.properties && feature.properties.AREA_NA7)
		// Only care about names so make a copy with just the names
		.map((feature) => feature.properties.AREA_NA7);
	// Sort by name descending alphabetical order
	neighbourhoodNames.sort();
	// Make dropdown option for each neighbourhood
	neighbourhoodNames.forEach((neighbourhood) => {
		const option = document.createElement("option");
		option.value = neighbourhood;
		option.innerHTML = neighbourhood;
		select.appendChild(option);
	});
}

// Adds neighbourhoods from neighbourhoodJson to the map
function loadNeighbourhoodLayers(neighbourhoodJson) {
	map.addSource("neighbourhoods", {
		type: "geojson",
		data: neighbourhoodJson,
	});

	// Fill for the neighboorhood polygons (bottom layer)
	map.addLayer({
		id: "neighbourhoods-layer",
		type: "fill",
		source: "neighbourhoods",
		layout: {},
		paint: {
			// Fill colour based on CapPerc
			"fill-color": [
				"step",
				["get", "CapPerc"],
				CAP_PERC_COLORS[0],
				0.0001,
				CAP_PERC_COLORS[1],
				1.540001,
				CAP_PERC_COLORS[2],
				3.990001,
				CAP_PERC_COLORS[3],
			],
			// Make the hovered neighbourhood more transparent
			// Also make everything more transparent as you zoom in (to better see detail)
			"fill-opacity": [
				"interpolate",
				["linear"],
				["zoom"],
				10,
				["case", ["boolean", ["feature-state", "hover"], false], 0.5, 0.7],
				12,
				["case", ["boolean", ["feature-state", "hover"], false], 0.3, 0.5],
				14,
				["case", ["boolean", ["feature-state", "hover"], false], 0.1, 0.2],
				16,
				["case", ["boolean", ["feature-state", "hover"], false], 0.05, 0.1],
			],
		},
	});
	// Outline for neighbourhood polygons (2nd layer)
	map.addLayer({
		id: "neighbourhoods-outline",
		type: "line",
		source: "neighbourhoods",
		layout: {},
		paint: {
			"line-color": "#000000", // Outline color
			"line-width": 1, // Outline width
		},
	});
}

// Show the neighbourhood name and reduce opacity when hovering on neighbourhoods
const neighbourhoodsPopup = new mapboxgl.Popup({
	closeButton: false,
	closeOnClick: false,
});

// Keeps track of the currently hovered neighbourhood so we can change its opacity
let hoveredFeatureId = null;

// When the mouse moves over the neighbourhoods layer
map.on("mousemove", "neighbourhoods-layer", (e) => {
	if (e.features.length == 0) {
		return;
	}
	// Reset the hover state of the previously hovered feature
	if (hoveredFeatureId !== null) {
		map.setFeatureState({ source: "neighbourhoods", id: hoveredFeatureId }, { hover: false });
	}
	// Set the hover state of the currently hovered feature
	hoveredFeatureId = e.features[0].id;
	map.setFeatureState({ source: "neighbourhoods", id: hoveredFeatureId }, { hover: true });

	// Try to show the popup at the center of the neighbourhood, but if that fails then just show it
	// under the cursor
	let location = e.lngLat; // Default to cursor location
	try {
		// For some reason in its event handling logic mapbox makes any array feature property a string
		// even if it's an array everywhere outside this event handler, so try to convert it back to an array
		location = JSON.parse(e.features[0].properties.centroid);
	} catch (e) {
		// Do nothing
	}
	// Show the popup with the neighbourhood name
	neighbourhoodsPopup.setLngLat(location).setHTML(`<strong>${e.features[0].properties.AREA_NA7}</strong>`).addTo(map);
});

// When the mouse leaves the neighbourhoods layer
map.on("mouseleave", "neighbourhoods-layer", () => {
	if (hoveredFeatureId !== null) {
		map.setFeatureState({ source: "neighbourhoods", id: hoveredFeatureId }, { hover: false });
	}
	hoveredFeatureId = null;

	// Remove the neighbourhood popup
	neighbourhoodsPopup.remove();
});

/*--------------------------------------------------------------------
CREATE LEGEND IN JAVASCRIPT
--------------------------------------------------------------------*/
//Declare array variables for labels and colours
const legendlabels = ["0", "0-1.54", "1.55-3.99", "4-24.66"];

//Declare legend variable using legend div tag
const legend = document.getElementById("legend");

//For each layer create a block to put the colour and label in
legendlabels.forEach((label, i) => {
	const item = document.createElement("div"); //each layer gets a 'row' - this isn't in the legend yet, we do this later
	const key = document.createElement("span"); //add a 'key' to the row. A key will be the colour circle

	key.className = "legend-key"; //the key will take on the shape and style properties defined in css
	key.style.backgroundColor = CAP_PERC_COLORS[i];

	const value = document.createElement("span"); //add a value variable to the 'row' in the legend
	value.innerHTML = `${label}`; //give the value variable text based on the label

	item.appendChild(key); //add the key (colour circle) to the legend row
	item.appendChild(value); //add the value to the legend row

	legend.appendChild(item); //add row to the legend
});

/*--------------------------------------------------------------------
ADD INTERACTIVITY BASED ON HTML EVENT

This excludes the neighbourhoods dropdown since that will require the json to be loaded first
--------------------------------------------------------------------*/

// Add event listener which returns map view to full screen on button click using flyTo method
document.getElementById("returnbutton").addEventListener("click", () => {
	map.flyTo({
		center: defCenter,
		zoom: defZoom,
		essential: true,
	});
});

// Change display of legend based on check box
let legendcheck = document.getElementById("legendcheck");
legendcheck.addEventListener("change", (e) => (legend.style.display = e.target.checked ? "block" : "none"));

// Change neighbourhood map layer display based on check box using setLayoutProperty method
document.getElementById("layercheck").addEventListener("change", (e) => {
	map.setLayoutProperty("neighbourhoods-layer", "visibility", e.target.checked ? "visible" : "none");
	map.setLayoutProperty("neighbourhoods-outline", "visibility", e.target.checked ? "visible" : "none");
});

// Filter neighbourhoods overlay to show selected neighbourhood from dropdown
document.getElementById("boundaryfieldset").addEventListener("change", () => {
	boundaryvalue = document.getElementById("boundaryselect").value;
	if (boundaryvalue == "All") {
		// If showing all neighbourhoods just clear the filter
		map.setFilter("neighbourhoods-layer", null);
		map.setFilter("neighbourhoods-outline", null);
	} else {
		// Filter to neighbourhood with specific name based on dropdown value
		map.setFilter("neighbourhoods-layer", ["==", ["get", "AREA_NA7"], boundaryvalue]);
		map.setFilter("neighbourhoods-outline", ["==", ["get", "AREA_NA7"], boundaryvalue]);
	}
});
