export const englishSummaries:Record<string,string[]>={
 'maths-quadratic':['Write the equation in the form ax² + bx + c = 0, with a ≠ 0.','Choose factorisation, completing the square or the quadratic formula.','The discriminant Δ = b² − 4ac determines the number of real roots.'],
 'maths-trig':['Identify the opposite side, adjacent side and hypotenuse in a right-angled triangle.','Use the sine rule or cosine rule for suitable non-right-angled triangles.','Draw a labelled diagram and check units and the reasonableness of your result.'],
 'maths-probability':['List the possible outcomes and check whether they are equally likely.','For independent events, multiply their probabilities to find the joint probability.','Sampling without replacement changes the probabilities on later draws.'],
 'maths-m1-2':['A derivative describes the instantaneous rate of change.','For axⁿ, the derivative is anxⁿ⁻¹.','The gradient of a tangent is the derivative evaluated at that point.'],
 'maths-m2-8':['For AB to exist, the number of columns of A must equal the number of rows of B.','Matrix multiplication is generally not commutative.','A 2×2 matrix is invertible when its determinant ad − bc is non-zero.'],
 'chem-acids':['Acid strength describes the extent of ionisation in water; concentration describes amount per unit volume.','The net ionic equation for neutralisation is H⁺(aq) + OH⁻(aq) → H₂O(l).','For titration calculations, balance the equation, use n = cV and apply the mole ratio.'],
 'chem-equilibrium':['At dynamic equilibrium, forward and reverse reactions continue at equal rates.','The concentrations remain constant but are not necessarily equal.','A catalyst speeds up the approach to equilibrium without changing its composition.'],
 'chem-industrial':['The Haber process combines nitrogen and hydrogen to form ammonia in a reversible, exothermic reaction.','Industrial conditions balance rate, yield, cost and safety.','A catalyst does not change the equilibrium constant at a given temperature.'],
 'chem-materials':['Polymers are formed by joining monomers into large molecules.','Addition and condensation polymerisation have different reaction mechanisms and products.','The structure of a material influences its properties and uses.'],
 'chem-analytical':['Chromatography separates components of a mixture.','Rf is the distance travelled by a solute divided by the distance travelled by the solvent front.','Compare Rf values under the same experimental conditions.'],
};

export const englishExamples:Record<string,{example:string;misconception:string}>={
 'maths-quadratic':{example:'For x² − 5x + 6 = 0, factorise to get (x − 2)(x − 3) = 0, so x = 2 or 3.',misconception:'Δ = 0 means two equal real roots; it does not mean there are no real roots.'},
 'maths-trig':{example:'If the opposite side is 3 and the hypotenuse is 5, sin θ = 3/5.',misconception:'Label sides relative to the angle you are using. The opposite and adjacent sides change when you change the angle.'},
 'maths-probability':{example:'Two independent tosses of a fair coin both show heads with probability 1/2 × 1/2 = 1/4.',misconception:'Do not assume independence when sampling without replacement.'},
 'maths-m1-2':{example:'If f(x) = 3x², then f′(x) = 6x and f′(2) = 12.',misconception:'A zero derivative indicates a horizontal tangent, but does not alone guarantee a maximum or minimum.'},
 'maths-m2-8':{example:'For A = [[2, 1], [3, 4]], det A = 2 × 4 − 1 × 3 = 5.',misconception:'In general, AB and BA are not equal and may not even both be defined.'},
 'chem-acids':{example:'25.0 cm³ of 0.100 mol dm⁻³ NaOH contains 0.00250 mol. It neutralises 0.00250 mol of HCl.',misconception:'Strong does not mean concentrated: strength and concentration describe different properties.'},
 'chem-equilibrium':{example:'For N₂(g) + 3H₂(g) ⇌ 2NH₃(g), increasing pressure favours the side with fewer gas molecules.',misconception:'At equilibrium, concentrations are constant but need not be equal.'},
 'chem-industrial':{example:'In the Haber process, a higher pressure favours ammonia formation, but raises operating costs.',misconception:'A catalyst changes the rate of reaching equilibrium, not the equilibrium yield at a fixed temperature.'},
 'chem-materials':{example:'Ethene molecules can join by addition polymerisation to form poly(ethene).',misconception:'Consider both molecular structure and intermolecular forces when explaining a material’s properties.'},
 'chem-analytical':{example:'If a spot travels 3.0 cm and the solvent front travels 5.0 cm, Rf = 3.0/5.0 = 0.60.',misconception:'Rf comparisons are meaningful only under the same experimental conditions.'},
};
