import useAccountStore from "stores/account"
import { ReactComponent as HeartIcon } from "assets/icons/heart.svg"
import getClasses from "shared/helpers/getClasses"
import useWindowWidth from "shared/hooks/useWindowWidth"

// Renders bar chart for current health percentage
const renderChart = (percentage: number) => {
  const markup = []
  const { shadow, bg } = getClasses(percentage)

  for (let i = 0; i < 100; i += 20) {
    const barDelta = percentage - i > 0 ? percentage - i : 0
    const barPercentage = barDelta >= 20 ? 100 : barDelta * 5

    markup.push(
      <div
        className={`h-[3px] flex-grow overflow-hidden rounded shadow-health ${shadow}`}
        key={i}
      >
        <div
          className={`h-full ${bg} shadow-health ${shadow}`}
          // Much simpler to use inline here than fighting tailwind
          style={{ width: `${barPercentage}%` }}
        />
      </div>
    )
  }
  return markup
}

interface IAccountHealthProps {
  isPopup?: boolean
}

function AccountHealth({ isPopup }: IAccountHealthProps) {
  const { address, marginRatio } = useAccountStore((state) => ({
    address: state.address,
    marginRatio: state.marginRatio,
  }))
  const { isDesktop } = useWindowWidth()

  const healthPercentage =
    marginRatio >= 100 ? 0 : Math.round(100 - marginRatio)

  return (
    <div className={`flex ${isPopup ? "justify-between" : ""}`}>
      {isDesktop && (
        <p
          className={`self-start font-mono text-xs tracking-[-0.6px] text-lightgrey-b ${
            !isPopup && "mr-10"
          }`}
          data-tooltip-id="tooltip"
          data-tooltip-content="100% minus Margin Ratio. Low value means that risk of liquidation is high."
        >
          Account Health
        </p>
      )}
      <div
        className={`flex items-center gap-2 ${isPopup ? "w-28" : "flex-grow"}`}
      >
        {!isDesktop ? (
          <HeartIcon className={getClasses(healthPercentage).text} />
        ) : (
          <div className="flex flex-grow items-center justify-between gap-1 @sm:w-full">
            {renderChart(healthPercentage)}
          </div>
        )}
        <p
          className={`${getClasses(healthPercentage).text} ${
            !isDesktop ? "font-bold" : "text-xs"
          }`}
        >
          {!isDesktop && !address ? "---" : healthPercentage}%
        </p>
      </div>
    </div>
  )
}

export default AccountHealth
