import Layout from './Layout'

const LABEL = {
  fontSize: 12,
  fontWeight: 700,
  color: '#ff335f',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  margin: '0 0 16px 0',
}

const P = { fontSize: 17, color: '#66615b', lineHeight: 1.8, margin: '0 0 20px 0' }

export default function Methodology() {
  return (
    <Layout>
      <div style={{ fontFamily: 'Inter, sans-serif', color: '#242a49', padding: '72px 64px 80px 140px', maxWidth: 1075 }}>

        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 72,
          fontWeight: 700,
          color: '#242a49',
          lineHeight: 1.0,
          margin: '0 0 64px 0',
        }}>
          Methodology
        </h1>

        {/* 1 */}
        <div style={{ marginBottom: 48 }}>
          <div style={LABEL}>1. Problem Statement</div>
          <p style={P}>
            Data centers are one of the fastest-growing consumers of water and electricity in the
            United States, yet the only public tools that exist to estimate their environmental
            effects are tools that source its information from company press releases, SEC filings,
            government permits, industry reports, verified news articles, and other fragmented
            third party resources that are often not cited and lack a single pipeline. There is
            currently no, or very few, public tools that exist that attempt to estimate water and
            energy consumption at a facility-by-facility basis with transparent and quantifiable
            uncertainty. Existing tools either show where data centers are located without
            estimating consumption (PNNL Atlas, FracTracker), apply national average water
            intensity figures that don't take into account regional variation (Siddik et al. 2021),
            or combine consumption metrics at the sector level without granularity on a
            facility-by-facility basis (Berkeley Lab 2016, 2024). Companies are not required to
            publicly disclose individual facilities' water or energy consumption, resulting in
            communities near operating or planned data centers unable to quantify what is being
            extracted from their local water supply or grid. Project Upstream attempts to be the
            stepping-stone in solving this problem by applying the Lei & Masanet (2022) climate
            and technology specific thermodynamic simulation model at an individual facility level
            across the entire U.S., giving both technical community organizers and regular citizens
            specific facility electricity and water consumption estimates with confidence intervals
            derived from Latin hypercube sampling across operational parameter uncertainty ranges.
          </p>
        </div>

        {/* 2 */}
        <div style={{ marginBottom: 48 }}>
          <div style={LABEL}>2. Data Sources</div>
          <p style={P}>
            <strong>PNNL IM3 Open Source Data Center Atlas.</strong> Sourced from the Pacific
            Northwest National Laboratory. This dataset supplies verified facility locations,
            square footage, operator names, and coordinates for existing U.S. data centers sourced
            from the publicly sourced platform OpenStreetMap. The version used in Project Upstream
            was last updated February 9, 2026, and it contains 1,242 facilities. This dataset's
            primary limitation is coverage because only facilities tagged in OpenStreetMap are
            included, which skews toward larger, more visible facilities and excludes many smaller
            enterprise data centers. Square footage is the primary value Project Upstream uses from
            this source.
          </p>
          <p style={P}>
            <strong>FracTracker Alliance Data Center Dataset.</strong> FracTracker investigates
            data center development across the U.S. through public records, media scanning, and
            permit documents. These resources include proposed, permitted, under construction, and
            operational facilities in the U.S. This dataset contributed 1,523 additional facility
            records, although MW capacity was available for approximately 50% of records and
            cooling type was available for approximately 2–3% of records. FracTracker's primary
            value to Project Upstream is its vast coverage of pipeline facilities and its MW
            capacity availability, which functions as the key input for Tier 1 and Tier 2
            estimation. FracTracker's primary limitation is that MW figures represent reported
            capacity from public records, whereas verified operational capacity directly reported
            from the data center operators would provide more accuracy.
          </p>
          <p style={P}>
            <strong>U.S. Census Bureau American Community Survey 5-Year Data (2009–2024).</strong>{' '}
            Tract-level demographic data was obtained via the Census Bureau ACS API. Variables
            extracted include total population (B01003_001E), median household income
            (B19013_001E), white alone population (B02001_002E), and population below the poverty
            level (B17001_002E). Facility coordinates were geocoded to census tract FIPS codes
            using the Census Geocoder API. This dataset's primary value to Project Upstream is
            that the data forms the entirety of the environmental justice overlay of Project
            Upstream by illustrating which communities are disproportionately affected by data
            center water and energy consumption.
          </p>
          <p style={P}>
            <strong>EPA Enforcement and Compliance History Online (ECHO).</strong> The EPA ECHO
            REST API was queried for each facility by name and state to retrieve regulatory
            compliance history across the Clean Air Act, Clean Water Act, Resource Conservation
            and Recovery Act, and Safe Drinking Water Act programs. Match rates were low (~15%)
            as expected because most data centers are not directly regulated under these programs.
            However, ECHO records provide supplementary context for facilities with environmental
            violations.
          </p>
          <p style={{ ...P, margin: 0 }}>
            <strong>EPA eGRID.</strong> Regional grid water intensity values by balancing authority
            region are used to calculate indirect water consumption, which is the water consumed at
            power plants generating each facility's electricity. This dataset was used by providing
            each individual facility's coordinates and mapping them to balancing authority regions
            to assign region-specific water intensity factors.
          </p>
        </div>

        {/* 3 */}
        <div style={{ marginBottom: 48 }}>
          <div style={LABEL}>3. Estimation Methodology</div>
          <p style={P}>
            <strong>3a. Introduction.</strong> Project Upstream estimates two primary values for
            each facility. First, an annual electricity consumption estimate in MWh with an 80%
            confidence interval. Second, an annual water consumption estimate in liters with an
            80% confidence interval. Water consumption is the sum of direct water consumed on-site
            by the cooling system and indirect water consumed at power plants that generate the
            facility's electricity.
          </p>
          <p style={P}>
            <strong>3b. Core Formulas.</strong> Annual Electricity (MWh) = MW × 8,760 Hours.
            Annual Direct Water (liters) = IT Load (kW) × WUE (L/kWh) × 8,760 Hours. Annual
            Indirect Water (m³) = Annual Electricity (MWh) × Regional Grid Water Intensity
            (m³/MWh). Total Water = Direct Water + Indirect Water. IT Load (kW) = (MW × 1,000)
            / PUE. PUE is Power Usage Effectiveness (total facility power / IT equipment power).
            WUE is Water Usage Effectiveness (liters of on-site water consumed per kWh of IT
            energy). PUE and WUE estimations come from the Lei & Masanet (2022) thermodynamic
            simulation model. Regional grid water intensity is derived from EPA eGRID by balancing
            authority region.
          </p>
          <p style={{ ...P, margin: 0 }}>
            <strong>3c. PUE and WUE Estimation.</strong> PUE and WUE are estimated using an
            open-source Python simulation model published by Lei & Masanet (2022). This model
            produces PUE and WUE ranges in a thermodynamically compatible structure for 10 data
            center archetypes which vary across 15 ASHRAE/IECC climate zones. The model has two
            primary inputs: facility system parameters (equipment efficiencies, temperature and
            humidity setpoints, cooling tower operational parameters, and more) and climate data
            (outdoor dry bulb temperature, relative humidity, atmospheric pressure). Due to the
            fact that parameters for specific facilities aren't publicly disclosed, Project Upstream
            applies Latin hypercube sampling across the parameter ranges defined in Table B.1 of
            Lei & Masanet (2022) for each size class, generating 50 parameter vectors per
            facility. Each vector produces a distribution of 50 PUE/WUE pairs. The median is the
            point estimate; the 10th and 90th percentiles define the 80% confidence interval.
            Climate inputs are derived by matching facility coordinates to one of the 15 ASHRAE
            climate zones using approximate geographic boundaries. The appropriate simulation
            function is selected based on facility size class and cooling system type. Size class
            is derived from square footage (small: &lt;1,000 sq ft, midsize: 1,000–20,000 sq ft,
            large: &gt;20,000 sq ft) following the taxonomy of Shehabi et al. (2016). When cooling
            type is unknown, a probability-weighted average PUE and WUE is calculated across the
            cooling system distribution for that size class, using the national cooling system
            distribution reported in Berkeley Lab (2024) Figure 4.2.
          </p>
        </div>

        {/* 4 */}
        <div style={{ marginBottom: 48 }}>
          <div style={LABEL}>4. Uncertainty Quantification</div>
          <p style={P}>
            <strong>Tier 1 (MW known + cooling type known):</strong> The simulation is run for the
            specific Lei & Masanet case corresponding to that cooling type and size class.
            Confidence intervals reflect only operational parameter uncertainty from Latin
            hypercube sampling. This is the narrowest interval.
          </p>
          <p style={P}>
            <strong>Tier 2 (MW known, cooling type unknown):</strong> The simulation is run for
            each possible cooling type weighted by the Berkeley Lab 2024 national probability
            distribution for that size class. Confidence intervals reflect both operational
            parameter uncertainty and cooling type uncertainty. This produces a wider interval
            than Tier 1.
          </p>
          <p style={P}>
            <strong>Tier 3 (sqft only, MW not known):</strong> PUE and WUE estimates are produced
            using the default case for that size class, but electricity and water consumption
            totals cannot be computed without MW. These facilities are displayed on the map with
            PUE and WUE reference values only, flagged as insufficient data for consumption
            estimates.
          </p>
          <p style={P}>
            <strong>Unestimable (neither MW nor sqft known):</strong> No estimate is produced and
            these facilities are flagged on the map as having insufficient data.
          </p>
          <p style={{ ...P, margin: 0 }}>
            The key drivers of wide confidence intervals are cooling type uncertainty (Tier 2),
            facility size class (small and midsize facilities have wider parameter ranges in
            Table B.1 than large facilities), and climate zone (hot humid climates produce higher
            variance in WUE for cooling-tower-dependent systems).
          </p>
        </div>

        {/* 5 */}
        <div style={{ marginBottom: 48 }}>
          <div style={LABEL}>5. Demographic Burden Analysis</div>
          <p style={{ ...P, margin: 0 }}>
            Facility coordinates were geocoded to census tract FIPS codes using the Census
            Geocoder API. For each facility, the census tract containing the facility's coordinates
            was retrieved, and the following ACS 5-year variables were extracted: total population,
            median household income, percentage of non-white residents (calculated as (population
            − white alone) / population × 100), and percentage of residents below the poverty
            level. These variables are combined to each facility record and displayed with
            consumption estimates to create a clear illustration of correlational patterns between
            consumption and demographics. The geographic unit is the census tract, which represents
            populations of approximately 1,200–8,000 residents. This is the most granular data at
            which all four variables are available from the ACS 5-year dataset.
          </p>
        </div>

        {/* 6 */}
        <div style={{ marginBottom: 48 }}>
          <div style={LABEL}>6. Limitations</div>
          <p style={{ ...P, margin: 0 }}>
            Facility location data is primarily an aggregated dataset from crowdsourced and
            advocacy-sourced datasets, leading to potential issues that the dataset may be
            incomplete or outdated, and some facilities may even have geocoding errors. Furthermore,
            available MW capacity figures represent reported capacity and may overstate actual
            consumption. Cooling type is unknown for approximately 97–98% of facilities. These
            facilities, to estimate the water usage based on its cooling type, requires using a
            probability-weighted estimation that applies a national average distribution rather than
            facility-specific values. This produces identical estimates for facilities of the same
            size class in the same climate zone, which does not reflect real differences and nuances
            between facilities. The indirect water calculation uses a static placeholder intensity
            of 1.8 m³/MWh rather than facility-specific eGRID values, which will be replaced in a
            future version. eGRID doesn't directly provide water intensity by balancing authority;
            rather, Project Upstream would have to use EIA Form 923 thermoelectric cooling water
            data combined with eGRID generation data to calculate water intensity per balancing
            authority, which is a significant addition. The demographic analysis assigns the census
            tract containing the facility's coordinates, which may not capture all affected
            communities. The model does not account for liquid cooling systems used by
            AI-specialized data centers, which have different water consumption profiles than the
            air-cooled and evaporative archetypes modeled by Lei & Masanet (2022).
          </p>
        </div>

        {/* 7 */}
        <div>
          <div style={LABEL}>7. Validation</div>
          <p style={{ ...P, margin: 0 }}>
            The process of validating estimations against publicly disclosed data from hyperscale
            operators of their individual facilities is soon to come. Google, Microsoft, and Amazon
            publish annual reports with WUE figures by region. Future validation methods will
            compare these figures against Project Upstream's facility estimates to check whether
            the distribution of estimates and Project Upstream's confidence in them aligns with
            disclosed regional figures. Lei & Masanet (2022) conducted a process of validation for
            their simulation model against reported annual PUE and WUE values from Facebook data
            centers in four climate zones. Ultimately, all reported values were contained within
            the model's simulated ranges, which indirectly validates the underlying model Project
            Upstream uses.
          </p>
        </div>

      </div>
    </Layout>
  )
}
