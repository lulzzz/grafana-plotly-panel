
import {MetricsPanelCtrl} from  'app/plugins/sdk';

import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';

import * as Plotly from './external/plotly';

class PlotlyPanelCtrl extends MetricsPanelCtrl {

  constructor($scope, $injector, $q, $rootScope, $timeout, $window, timeSrv, uiSegmentSrv) {
    super($scope, $injector);

    this.$rootScope = $rootScope;
    this.timeSrv = timeSrv;
    this.uiSegmentSrv = uiSegmentSrv;
    this.q = $q;

    this.sizeChanged = true; 
    this.initalized = false;
    
    this.$tooltip = $('<div id="tooltip" class="graph-tooltip">');


    var dcfg = {
      settings: {
        type: 'scatter',
        mode: 'lines+markers',
        displayModeBar: false,
        line: {
          color : '#005f81',
          width : 6,
          dash  : 'solid',
          shape : 'linear'
        },
        marker: {
          size: 30,
          symbol: 'circle',
          color: '#33B5E5',
          colorscale: 'YIOrRd',
          line: {
            color: '#DDD',
            width: 0
          },
          showscale: true
        },
        color_option: 'ramp'
      },
      layout: {
        autosize: false,
        showlegend: false,
        legend: {"orientation": "v"},
        dragmode: 'lasso', // (enumerated: "zoom" | "pan" | "select" | "lasso" | "orbit" | "turntable" ) 
        hovermode: 'closest',
        plot_bgcolor: "#1f1d1d",
        paper_bgcolor: 'rgba(0,0,0,0)', // transparent?
        font: {
          color: '#D8D9DA',
          family: '"Open Sans", Helvetica, Arial, sans-serif' 
        },
        margin: {
          t: 0,
          b: 45,
          l: 65,
          r: 20,
        },
        xaxis: {
          showgrid: true,
          zeroline: false,
          type: 'linear',
          gridcolor: '#444444',
          range: [null, null]
        },
        yaxis: {
          showgrid: true,
          zeroline: false,
          type: 'linear',
          gridcolor: '#444444',
          range: [null, null]
        },
        scene: {
          xaxis:{title: 'X AXIS'},
          yaxis:{title: 'Y AXIS'},
          zaxis:{title: 'Z AXIS'},
        },
      }
    };

    // Make sure it has the default settings (may have more!)
    this.panel.pconfig = $.extend(true, dcfg, this.panel.pconfig );

    var cfg = this.panel.pconfig;
    this.trace = {
      x: [],
      y: [],
      z: []
    };
    this.layout = $.extend(true, {}, this.panel.pconfig.layout );

    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('render', this.onRender.bind(this));
    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-error', this.onDataError.bind(this));
    this.events.on('panel-initialized', this.onPanelInitalized.bind(this));
    this.events.on('refresh', this.onRefresh.bind(this));


    angular.element($window).bind('resize', this.onResize.bind(this) );

    this.onConfigChanged();
  }

  onResize() {
    this.sizeChanged = true;
  }

  onDataError(err) {
    this.seriesList = [];
    this.render([]);
    console.log("onDataError", err);
  }

  onRefresh() {
    console.log("onRefresh()")

    if(this.graph && this.initalized) {
      Plotly.redraw(this.graph);
    }
  }

  onInitEditMode() {
    this.addEditorTab('Options', 'public/plugins/natel-plotly-panel/editor.html',1);
    this.editorTabIndex = 1;
    this.refresh();
    this.segs = {
      symbol: this.uiSegmentSrv.newSegment({value: this.panel.pconfig.settings.marker.symbol })
    };
  }

  onSegsChanged() {
    this.panel.pconfig.settings.marker.symbol = this.segs.symbol.value;
    this.onConfigChanged();

    console.log( this.segs.symbol, this.panel.pconfig );
  }

  onPanelInitalized() {
    console.log("onPanelInitalized()")
  }

  onRender() {

    if(!this.initalized) {
      var s = this.panel.pconfig.settings;

      var options = {
        showLink: false, 
        displaylogo: false,
        displayModeBar: s.displayModeBar,
        modeBarButtonsToRemove: ['sendDataToCloud'] //, 'select2d', 'lasso2d']
      }

      var data = [this.trace];
      var rect = this.graph.getBoundingClientRect();

      var old = this.layout;
      this.layout = $.extend(true, {}, this.panel.pconfig.layout );
      this.layout.height = this.height;
      this.layout.width = rect.width;
      if(old) {
        this.layout.xaxis.title = old.xaxis.title;
        this.layout.yaxis.title = old.yaxis.title;
      }

      Plotly.newPlot(this.graph, data, this.layout, options);

      this.graph.on('plotly_click', (data) => {
        for(var i=0; i < data.points.length; i++){
          var idx = data.points[i].pointNumber;
          var ts = this.trace.ts[idx];
         // console.log( 'CLICK!!!', ts, data );
          var msg = data.points[i].x.toPrecision(4) + ", "+data.points[i].y.toPrecision(4);
          this.$rootScope.appEvent('alert-success', [msg, '@ ' + this.dashboard.formatDate(moment(ts))]);
        }
      });

      //if(false) {
        this.graph.on('plotly_hover', (data, xxx) => {
          console.log( 'HOVER!!!', data, xxx, this.mouse );
          if(data.points.length>0) {
            var idx = 0;
            var pt = data.points[idx];

            var body = '<div class="graph-tooltip-time">'+ pt.pointNumber +'</div>';
            body += "<center>";
            body += pt.x + ', '+pt.y;
            body += "</center>";

            this.$tooltip.html( body ).place_tt( this.mouse.pageX + 10, this.mouse.pageY );
          }
        }).on('plotly_unhover', (data) => {
          this.$tooltip.detach(); 
        });
      //}

      this.graph.on('plotly_selected',  (data) => {

        if(data.points.length == 0) {
          console.log( "Nothign Selected", data)
          return;
        }

        console.log( "SELECTED", data)

        var min = Number.MAX_SAFE_INTEGER;
        var max = Number.MIN_SAFE_INTEGER;

        for(var i=0; i < data.points.length; i++){
          var idx = data.points[i].pointNumber;
          var ts = this.trace.ts[idx];
          min = Math.min( min, ts);
          max = Math.max( max, ts);
        }

        min -= 1000;
        max += 1000;

        var range = {from: moment.utc(min), to: moment.utc(max) };

        console.log( 'SELECTED!!!', min, max, data.points.length, range ); 

        this.timeSrv.setTime(range);

        // rebuild the graph after query
        if(this.graph) {
          Plotly.Plots.purge(this.graph);
          this.graph.innerHTML = '';
          this.initalized = false;
        }
      });
    }
    else {
      Plotly.redraw(this.graph);
    }

    if(this.sizeChanged && this.graph && this.layout) {
      var rect = this.graph.getBoundingClientRect();
      this.layout.width = rect.width;
      Plotly.Plots.resize(this.graph);
    }

    this.sizeChanged = false; 
    this.initalized = true;
    console.log("onRender");
  }

  onDataReceived(dataList) {
      if (this.panel.pconfig.settings.type == "Bar") {
          var fields = [];
          //var startDate = new Date(data.StartDate);
          //var endDate = new Date(data.EndDate);

          $.each(dataList, function (i, d) {
              fields.push({
                  x: d.datapoints.map(function (a) {
                      var now = new Date(a[1]);
                      var utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
                      return utc
                  }),
                  y: d.datapoints.map(function (a) { return a[0] }),
                  name: d.target,
                  //marker: {
                  //    color: types.Color,
                  //},
                  type: 'bar'
              });
          });

          var layout = {
              title: val.slice(0, val.length - 1) + " Type by Date",
              xaxis: {
                  title: 'Date',
                  type: 'date',
                  tickFormat: Plotly.d3.time.format.utc("%m-%d"),
                  //range: [new Date(startDate.getTime() + startDate.getTimezoneOffset() * 60000).getTime(), new Date(endDate.getTime() + endDate.getTimezoneOffset() * 60000).getTime()]
              },
              yaxis: {
                  title: val.slice(0, val.length - 1) + ' Counts',
                  range: [0]
              },
              barmode: 'stack'
          };
          Plotly.
          Plotly.newPlot(this.graph, fields, this.layout, layout);

      }
      else {

          this.trace.x = [];
          this.trace.y = [];
          this.trace.z = [];
          this.trace.ts = [];

          if (dataList.length < 2) {
              console.log("No data", dataList);
          }
          else {
              //   console.log( "plotly data", dataList);

              var cfg = this.panel.pconfig;

              var srcX = dataList[0].datapoints;
              var srcY = dataList[1].datapoints;

              if (srcX.length != srcY.length) {
                  throw "Metrics must have the same count! (x!=y)";
              }

              var srcZ = null;
              if (cfg.settings.type == 'scatter3d') {
                  srcZ = dataList[2].datapoints;
                  if (srcZ.length != srcY.length) {
                      throw "Metrics must have the same count! (z!=y)";
                  }
                  this.layout.scene.xaxis.title = dataList[0].target;
                  this.layout.scene.yaxis.title = dataList[1].target;
                  this.layout.scene.zaxis.title = dataList[2].target;

                  console.log("3D", this.layout);

              }
              else {
                  this.layout.xaxis.title = dataList[0].target;
                  this.layout.yaxis.title = dataList[1].target;
              }

              var srcColor = null;
              if (cfg.settings.color_option == 'data') {
                  var is3d = (cfg.settings.type == 'scatter3d');
                  if (dataList.length < (is3d ? 4 : 3)) {
                      throw "Need extra metric for color!";
                  }
                  srcColor = dataList[is3d ? 3 : 2].datapoints;
              }

              this.trace.marker = $.extend(true, {}, cfg.settings.marker);
              this.trace.line = $.extend(true, {}, cfg.settings.line);
              if (cfg.settings.color_option == 'ramp' || cfg.settings.color_option == 'data') {
                  this.trace.marker.color = [];
              }

              var len = srcX.length;
              for (var i = 0; i < len; i++) {
                  this.trace.ts.push(srcX[i][1]);
                  this.trace.x.push(srcX[i][0]);
                  this.trace.y.push(srcY[i][0]);
                  if (cfg.settings.color_option == 'ramp') {
                      this.trace.marker.color.push(i);
                  } else if (srcColor) {
                      this.trace.marker.color.push(srcColor[i][0]);
                  }
                  if (srcZ) {
                      this.trace.z.push(srcZ[i][0]);
                  }
              }
          }
          this.render();
      }
  }

  onConfigChanged() {
    console.log( "Config changed...");
    if(this.graph) {
      Plotly.Plots.purge(this.graph);
      this.graph.innerHTML = '';
      this.initalized = false;
    }

    var cfg = this.panel.pconfig;
    this.trace.type = cfg.settings.type;
    this.trace.mode = cfg.settings.mode;
    this.refresh();
  }

  link(scope, elem, attrs, ctrl) {
    this.graph = elem.find('.plotly-spot')[0];
    this.initalized = false;
    elem.on( 'mousemove', (evt) => {
      this.mouse = evt;
    });
  }

  //---------------------------


  getSymbolSegs()
  {
    var txt = [
"circle","circle-open","circle-dot","circle-open-dot",
"square","square-open","square-dot","square-open-dot",
"diamond","diamond-open",
"diamond-dot","diamond-open-dot",
"cross","cross-open",
"cross-dot","cross-open-dot",
"x","x-open","x-dot","x-open-dot",
"triangle-up",
"triangle-up-open",
"triangle-up-dot",
"triangle-up-open-dot",
"triangle-down",
"triangle-down-open",
"triangle-down-dot",
"triangle-down-open-dot",
"triangle-left",
"triangle-left-open",
"triangle-left-dot",
"triangle-left-open-dot",
"triangle-right",
"triangle-right-open",
"triangle-right-dot",
"triangle-right-open-dot",
"triangle-ne",
"triangle-ne-open",
"triangle-ne-dot",
"triangle-ne-open-dot",
"triangle-se",
"triangle-se-open",
"triangle-se-dot",
"triangle-se-open-dot",
"triangle-sw",
"triangle-sw-open",
"triangle-sw-dot",
"triangle-sw-open-dot",
"triangle-nw",
"triangle-nw-open",
"triangle-nw-dot",
"triangle-nw-open-dot",
"pentagon",
"pentagon-open",
"pentagon-dot",
"pentagon-open-dot",
"hexagon",
"hexagon-open",
"hexagon-dot",
"hexagon-open-dot",
"hexagon2",
"hexagon2-open",
"hexagon2-dot",
"hexagon2-open-dot",
"octagon",
"octagon-open",
"octagon-dot",
"octagon-open-dot",
"star",
"star-open",
"star-dot",
"star-open-dot",
"hexagram",
"hexagram-open",
"hexagram-dot",
"hexagram-open-dot",
"star-triangle-up",
"star-triangle-up-open",
"star-triangle-up-dot",
"star-triangle-up-open-dot",
"star-triangle-down",
"star-triangle-down-open",
"star-triangle-down-dot",
"star-triangle-down-open-dot",
"star-square",
"star-square-open",
"star-square-dot",
"star-square-open-dot",
"star-diamond",
"star-diamond-open",
"star-diamond-dot",
"star-diamond-open-dot",
"diamond-tall",
"diamond-tall-open",
"diamond-tall-dot",
"diamond-tall-open-dot",
"diamond-wide",
"diamond-wide-open",
"diamond-wide-dot",
"diamond-wide-open-dot",
"hourglass",
"hourglass-open",
"bowtie",
"bowtie-open",
"circle-cross",
"circle-cross-open",
"circle-x",
"circle-x-open",
"square-cross",
"square-cross-open",
"square-x",
"square-x-open",
"diamond-cross",
"diamond-cross-open",
"diamond-x",
"diamond-x-open",
"cross-thin",
"cross-thin-open",
"x-thin",
"x-thin-open",
"asterisk",
"asterisk-open",
"hash",
"hash-open",
"hash-dot",
"hash-open-dot",
"y-up",
"y-up-open",
"y-down",
"y-down-open",
"y-left",
"y-left-open",
"y-right",
"y-right-open",
"line-ew",
"line-ew-open",
"line-ns",
"line-ns-open",
"line-ne",
"line-ne-open",
"line-nw",
"line-nw-open"
    ];

    var segs = [];
    _.forEach(txt, (val) => {
      segs.push( this.uiSegmentSrv.newSegment( val ) );
    });
    return this.q.when( segs );
  }
}
PlotlyPanelCtrl.templateUrl = 'module.html';

export {
  PlotlyPanelCtrl as PanelCtrl
};


