import { useMemo } from "react"
import { ApexOptions } from "apexcharts"
import moment from "moment"
import { renderToString } from "react-dom/server"
import ApexChart from "react-apexcharts"
import IconPlus from "assets/icons/plus.svg"
import IconMinus from "assets/icons/minus.svg"
import IconRotateCW from "assets/icons/rotate-cw.svg"
import IconZoomIn from "assets/icons/zoom-in.svg"
import IconMouse from "assets/icons/mouse-pointer.svg"
import useWindowWidth from "shared/hooks/useWindowWidth"
import ChartTooltip from "./ChartTooltip"

interface IChart {
  value: {
    x: number
    y: string
    meta: {
      collateralValue?: number
      unrealizedPnl?: number
      unrealizedFunding?: number
    }
  }[]
}

function Chart({ value }: IChart) {
  const startDate = moment(value[value.length - 1].x).format("MMM DD")
  const endDate = moment(value[0].x).format("MMM DD")
  const { isDesktop } = useWindowWidth()

  const titleText =
    startDate === endDate ? startDate : `${startDate} - ${endDate}`

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        id: "portfolio-overview",
        background: isDesktop ? "#1A1A1A" : "#0F0E0C" ,
        fontFamily: "ABCMonumentGrotesk, sans-serif",
        foreColor: "#7F8D9D",
        toolbar: {
          show: isDesktop,
          tools: {
            download: false,
            zoom: `<img src="${IconZoomIn}" style='width: 20px;'>`,
            zoomin: `<img src="${IconPlus}" style='width: 20px;'>`,
            zoomout: `<img src="${IconMinus}" style='width: 20px;'>`,
            reset: `<img src="${IconRotateCW}" style='width: 20px;'>`,
            pan: `<img src="${IconMouse}" style='width: 20px;'>`,
          },
        },
      },
      colors: ["#4BC2A3"],
      stroke: {
        curve: "smooth",
        lineCap: "round",
      },
      xaxis: {
        type: "datetime",
        labels: {
          show: isDesktop,
          datetimeUTC: false,
          formatter: (v, timestamp) => moment(timestamp).format("h:mm a"),
          offsetX: 5,
        },
        crosshairs: {
          show: true,
          stroke: {
            width: 1,
            dashArray: 8,
            color: "#7F8D9D",
          },
        },
        tooltip: {
          enabled: false,
        },
        axisBorder: {
          show: false,
        },
        axisTicks: {
          show: false,
        },
      },
      yaxis: {
        opposite: true,
        labels: {
          show: isDesktop,
          formatter: (val) => val.toFixed(2),
        },
        crosshairs: {
          show: true,
          position: "front",
          stroke: {
            width: 1,
            dashArray: 8,
            color: "#7F8D9D",
          },
        },
        tooltip: {
          enabled: false,
        },
      },
      grid: {
        show: false,
      },
      legend: {
        show: false,
      },
      theme: {
        mode: "dark",
      },
      title: {
        text: isDesktop ? titleText : undefined,
        align: "left",
        offsetX: 50,
        offsetY: -2,
        style: {
          color: "white",
        },
      },
      tooltip: {
        custom: ({ series, dataPointIndex, seriesIndex }) => {
          const { meta } = value[dataPointIndex]
          return renderToString(
            <ChartTooltip
              value={series[seriesIndex][dataPointIndex]}
              dateTime={moment(value[dataPointIndex].x).format(
                "h:mm a, MMM DD"
              )}
              collateralValue={meta.collateralValue}
              unrealizedPnl={meta.unrealizedPnl}
            />
          )
        },
      },
    }),
    [value.length, isDesktop]
  )

  const series = useMemo(
    () => [
      {
        name: "Value",
        data: value,
      },
    ],
    [value.length]
  )

  return (
    <ApexChart
      width="100%"
      height="100%"
      type="line"
      options={options}
      series={series}
    />
  )
}

export default Chart
