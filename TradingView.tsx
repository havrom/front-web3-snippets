import { useRef, useEffect, useState } from "react"
import getDatafeed from "lib/TradingView/datafeed"
import useWindowWidth from "shared/hooks/useWindowWidth"
import { getTokenFromSymbol } from "shared/helpers"
import { ReactComponent as NoDataIcon } from "assets/icons/no-data.svg"
import {
  widget as Widget,
  IChartingLibraryWidget,
} from "../../public/charting_library"
import Toggler from "./Toggler"
import NotificationBanner from "./NotificationBanner"

const mobileDisabledFeatures = [
  "left_toolbar",
  "control_bar",
  "header_widget",
  "legend_widget",
  "create_volume_indicator_by_default",
  "main_series_scale_menu",
]

interface ITradingView {
  symbol: string
}

function TradingView({ symbol }: ITradingView) {
  const [isChartReady, setIsChartReady] = useState(false)
  const [isNoData, setIsNoData] = useState(false)
  const [isProjectApi, setIsProjectApi] = useState(true)
  const tvRef = useRef<null | IChartingLibraryWidget>(null)
  const { isMobile, isTablet } = useWindowWidth()

  useEffect(() => {
    setIsChartReady(false)
    setIsNoData(false)
    const datafeed = getDatafeed(isProjectApi)
    const widgetOptions: any = {
      container: "chart_container",
      datafeed,
      library_path: "/charting_library/",
      debug: false,
      fullscreen: false,
      symbol: getTokenFromSymbol(symbol) + "USDT",
      interval: "60",
      theme: "dark",
      allow_symbol_change: false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      autosize: true,
      custom_css_url: "/tradingview.css",
      toolbar_bg: isMobile ? "#0F0E0C" : "#1A1A1A",
      loading_screen: {
        backgroundColor: isMobile ? "#0F0E0C" : "#1A1A1A",
        foregroundColor: "#FF7456",
      },
      overrides: {
        "mainSeriesProperties.candleStyle.upColor": "#4BC2A3",
        "mainSeriesProperties.candleStyle.downColor": "#E03737",
        "mainSeriesProperties.candleStyle.borderUpColor": "#4BC2A3",
        "mainSeriesProperties.candleStyle.borderDownColor": "#E03737",
        "mainSeriesProperties.candleStyle.wickUpColor": "#4BC2A3",
        "mainSeriesProperties.candleStyle.wickDownColor": "#E03737",
        "paneProperties.backgroundType": "solid",
        "paneProperties.background": isMobile ? "#0F0E0C" : "#1A1A1A",
        "paneProperties.vertGridProperties.color":
          isMobile || isTablet ? "transparent" : "#222127",
        "paneProperties.horzGridProperties.color":
          isMobile || isTablet ? "transparent" : "#222127",
        "scalesProperties.lineColor":
          isMobile || isTablet ? "#0F0E0C" : "#AEADAD",
      },
      disabled_features: [
        "header_symbol_search",
        "use_localstorage_for_settings",
        "timeframes_toolbar",
        "header_undo_redo",
        ...(isMobile || isTablet ? mobileDisabledFeatures : []),
      ],
    }
    const tvWidget = new Widget(widgetOptions) as IChartingLibraryWidget
    tvRef.current = tvWidget

    tvWidget.onChartReady(() => {
      setIsChartReady(true)
      const tvChartData = localStorage.getItem(`tvChartData-${symbol}`)
      if (tvChartData) {
        tvWidget.load(JSON.parse(tvChartData))
      }
      tvWidget.subscribe("drawing_event", () => {
        tvWidget.save((data: any) => {
          localStorage.setItem(`tvChartData-${symbol}`, JSON.stringify(data))
        })
      })

      if (!tvWidget.chart().dataReady(() => {})) {
        if (isMobile || isTablet) {
          tvWidget.remove()
        }
        setIsNoData(true)
      }
    })
  }, [symbol, isProjectApi, isMobile, isTablet])

  return (
    <div className="relative flex flex-1 flex-col items-center @xl:justify-center">
      <div
        className={
          isNoData && (isMobile || isTablet)
            ? "h-0"
            : "h-[96%] w-full @sm:h-full"
        }
        id="chart_container"
      />
      {isNoData && (isMobile || isTablet) && (
        <>
          <NoDataIcon className="mb-2 text-lightgrey-b" />
          <NotificationBanner text="No data available" />
        </>
      )}

      {isChartReady && (
        <div className="absolute right-[141px] top-[7px] @xl:left-4 @xl:right-auto @xl:top-0 @sm:left-0">
          <Toggler
            value={!isProjectApi}
            setValue={setIsProjectApi}
            labels={["Exchange1", "Exchange2"]}
            customColors={{ left: "green-a", right: "yellow-a" }}
          />
        </div>
      )}
    </div>
  )
}

export default TradingView
